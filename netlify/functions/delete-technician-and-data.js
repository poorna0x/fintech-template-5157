// Permanently delete a technician, related records, and their Supabase Auth user (admin only).
const { createClient } = require('@supabase/supabase-js');
const { getCorsHeaders, isOriginAllowed } = require('./cors-helper');

async function removeTechnicianFromTeamMembers(admin, technicianId) {
  const { data: teamJobs, error } = await admin
    .from('jobs')
    .select('id, team_members')
    .contains('team_members', [technicianId]);

  if (error) {
    console.warn('team_members cleanup query failed, scanning jobs:', error.message);
    const { data: allJobs, error: allErr } = await admin
      .from('jobs')
      .select('id, team_members')
      .not('team_members', 'is', null);
    if (allErr) throw allErr;
    for (const job of allJobs || []) {
      if (!Array.isArray(job.team_members) || !job.team_members.includes(technicianId)) continue;
      const team = job.team_members.filter((id) => id !== technicianId);
      const { error: upErr } = await admin
        .from('jobs')
        .update({ team_members: team.length > 0 ? team : null })
        .eq('id', job.id);
      if (upErr) throw upErr;
    }
    return;
  }

  for (const job of teamJobs || []) {
    const team = (job.team_members || []).filter((id) => id !== technicianId);
    const { error: upErr } = await admin
      .from('jobs')
      .update({ team_members: team.length > 0 ? team : null })
      .eq('id', job.id);
    if (upErr) throw upErr;
  }
}

async function cleanupMessages(admin, technicianId) {
  const { error: delDirect } = await admin
    .from('messages')
    .delete()
    .eq('recipient_technician_id', technicianId);
  if (delDirect && delDirect.code !== '42P01') {
    throw delDirect;
  }

  const { data: multiMsgs, error: multiErr } = await admin
    .from('messages')
    .select('id, recipient_technician_ids')
    .contains('recipient_technician_ids', [technicianId]);

  if (multiErr) {
    if (multiErr.code === '42P01') return;
    throw multiErr;
  }

  for (const msg of multiMsgs || []) {
    const ids = (msg.recipient_technician_ids || []).filter((id) => id !== technicianId);
    if (ids.length === 0) {
      const { error: delErr } = await admin.from('messages').delete().eq('id', msg.id);
      if (delErr) throw delErr;
    } else {
      const { error: upErr } = await admin
        .from('messages')
        .update({ recipient_technician_ids: ids })
        .eq('id', msg.id);
      if (upErr) throw upErr;
    }
  }
}

exports.handler = async (event) => {
  const requestOrigin = event.headers.origin || event.headers.Origin;
  const corsHeaders = getCorsHeaders(requestOrigin);

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders, body: '' };
  }

  if (requestOrigin && !isOriginAllowed(requestOrigin)) {
    return {
      statusCode: 403,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Forbidden: Origin not allowed' }),
    };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !serviceKey || !anonKey) {
    return {
      statusCode: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Server misconfigured' }),
    };
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return {
      statusCode: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Invalid JSON' }),
    };
  }

  const { technicianId, accessToken, confirmed, confirmPhrase, authOnly } = body;
  if (!technicianId || !accessToken) {
    return {
      statusCode: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Missing technicianId or accessToken' }),
    };
  }

  if (!confirmed && !confirmPhrase) {
    return {
      statusCode: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Missing confirmation' }),
    };
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: userData, error: userError } = await userClient.auth.getUser(accessToken);
  if (userError || !userData?.user) {
    return {
      statusCode: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Unauthorized' }),
    };
  }

  const role =
    userData.user.app_metadata?.role ||
    userData.user.user_metadata?.role ||
    'admin';
  if (role === 'technician') {
    return {
      statusCode: 403,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Admin only' }),
    };
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  if (authOnly) {
    const { error: authDeleteError } = await admin.auth.admin.deleteUser(technicianId);
    if (authDeleteError && !/not found|User not found/i.test(authDeleteError.message)) {
      return {
        statusCode: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: authDeleteError.message }),
      };
    }
    return {
      statusCode: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: true, authOnly: true }),
    };
  }

  const { data: tech, error: techError } = await admin
    .from('technicians')
    .select('id, full_name, employee_id, email')
    .eq('id', technicianId)
    .maybeSingle();

  if (techError) {
    return {
      statusCode: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: techError.message }),
    };
  }

  if (!tech) {
    return {
      statusCode: 404,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Technician not found' }),
    };
  }

  if (confirmPhrase) {
    const expectedPhrase = String(tech.employee_id || '').trim();
    if (String(confirmPhrase).trim() !== expectedPhrase) {
      return {
        statusCode: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Confirmation phrase does not match employee ID' }),
      };
    }
  }

  try {
    await admin.from('jobs').update({ assigned_technician_id: null }).eq('assigned_technician_id', technicianId);
    await admin.from('jobs').update({ assigned_by: null }).eq('assigned_by', technicianId);
    await admin.from('jobs').update({ completed_by: null }).eq('completed_by', technicianId);
    await removeTechnicianFromTeamMembers(admin, technicianId);
    await admin
      .from('amc_contracts')
      .update({ given_by_technician_id: null })
      .eq('given_by_technician_id', technicianId);
    await cleanupMessages(admin, technicianId);

    const { error: deleteRowError } = await admin.from('technicians').delete().eq('id', technicianId);
    if (deleteRowError) {
      throw deleteRowError;
    }

    const { error: authDeleteError } = await admin.auth.admin.deleteUser(technicianId);
    if (authDeleteError && !/not found|User not found/i.test(authDeleteError.message)) {
      console.warn('Auth user delete warning:', authDeleteError.message);
    }

    return {
      statusCode: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ok: true,
        deletedTechnicianId: technicianId,
        deletedName: tech.full_name,
      }),
    };
  } catch (err) {
    console.error('delete-technician-and-data failed:', err);
    return {
      statusCode: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: err.message || 'Delete failed' }),
    };
  }
};
