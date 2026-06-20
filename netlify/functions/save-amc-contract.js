// Persist AMC contract — admin or technician JWT (service role insert bypasses RLS).

const { createClient } = require('@supabase/supabase-js');
const { authorizeStaffAmcEmailRequest } = require('./admin-auth-guard');

function jsonResponse(statusCode, headers, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  };
}

function corsHeaders(event) {
  const origin = event.headers.origin || event.headers.Origin || '*';
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Email-Preview-Secret',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
}

function isIsoDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value.trim());
}

function parseBody(body) {
  if (!body || typeof body !== 'object') return { ok: false, error: 'Invalid request' };

  const customerId = typeof body.customer_id === 'string' ? body.customer_id.trim() : '';
  const startDate = typeof body.start_date === 'string' ? body.start_date.trim() : '';
  const endDate = typeof body.end_date === 'string' ? body.end_date.trim() : '';
  const years = Number(body.years);

  if (!customerId) return { ok: false, error: 'Missing customer_id' };
  if (!isIsoDate(startDate) || !isIsoDate(endDate)) {
    return { ok: false, error: 'Invalid start_date or end_date' };
  }
  if (!Number.isFinite(years) || years < 1 || years > 10) {
    return { ok: false, error: 'Invalid years' };
  }

  const includesPrefilter = Boolean(body.includes_prefilter);
  const jobId = typeof body.job_id === 'string' && body.job_id.trim() ? body.job_id.trim() : null;
  const givenByTechnicianId =
    typeof body.given_by_technician_id === 'string' && body.given_by_technician_id.trim()
      ? body.given_by_technician_id.trim()
      : null;

  let servicePeriodMonths = null;
  if (body.service_period_months != null && body.service_period_months !== '') {
    const n = Number(body.service_period_months);
    if (!Number.isFinite(n) || n < 0 || n > 24) {
      return { ok: false, error: 'Invalid service_period_months' };
    }
    servicePeriodMonths = n;
  }

  const serviceBrand =
    body.service_brand === 'hydrogenro' || body.service_brand === 'elevenro'
      ? body.service_brand
      : null;

  let additionalInfo = null;
  if (body.additional_info != null) {
    if (typeof body.additional_info === 'string') {
      additionalInfo = body.additional_info.slice(0, 50_000);
    } else {
      try {
        additionalInfo = JSON.stringify(body.additional_info).slice(0, 50_000);
      } catch {
        return { ok: false, error: 'Invalid additional_info' };
      }
    }
  }

  return {
    ok: true,
    payload: {
      customer_id: customerId,
      job_id: jobId,
      start_date: startDate,
      end_date: endDate,
      years: Math.round(years),
      includes_prefilter: includesPrefilter,
      additional_info: additionalInfo,
      service_period_months: servicePeriodMonths,
      given_by_technician_id: givenByTechnicianId,
      service_brand: serviceBrand,
    },
  };
}

async function renewExistingActiveAmcs(admin, customerId, exceptId = null) {
  let query = admin
    .from('amc_contracts')
    .select('id')
    .eq('customer_id', customerId)
    .eq('status', 'ACTIVE');

  if (exceptId) {
    query = query.neq('id', exceptId);
  }

  const { data: existingAMCs } = await query;

  if (!existingAMCs?.length) return;

  const today = new Date().toISOString().split('T')[0];
  for (const existingAMC of existingAMCs) {
    const { data: existing } = await admin
      .from('amc_contracts')
      .select('end_date')
      .eq('id', existingAMC.id)
      .single();

    const newStatus = existing && existing.end_date >= today ? 'RENEWED' : 'EXPIRED';
    await admin.from('amc_contracts').update({ status: newStatus }).eq('id', existingAMC.id);
  }
}

async function upsertAmcContract(admin, payload) {
  const insertBase = {
    customer_id: payload.customer_id,
    job_id: payload.job_id,
    start_date: payload.start_date,
    end_date: payload.end_date,
    years: payload.years,
    includes_prefilter: payload.includes_prefilter,
    additional_info: payload.additional_info,
    service_period_months: payload.service_period_months,
    given_by_technician_id: payload.given_by_technician_id,
    status: 'ACTIVE',
  };

  const withBrand = {
    ...insertBase,
    ...(payload.service_brand ? { service_brand: payload.service_brand } : {}),
  };

  if (payload.job_id) {
    const { data: existingForJob, error: lookupErr } = await admin
      .from('amc_contracts')
      .select('id')
      .eq('job_id', payload.job_id)
      .eq('status', 'ACTIVE')
      .maybeSingle();

    if (lookupErr) {
      return { error: lookupErr };
    }

    if (existingForJob?.id) {
      await renewExistingActiveAmcs(admin, payload.customer_id, existingForJob.id);

      let updateResult = await admin
        .from('amc_contracts')
        .update(withBrand)
        .eq('id', existingForJob.id)
        .select('id')
        .single();

      if (
        updateResult.error &&
        payload.service_brand &&
        /service_brand|column/.test(String(updateResult.error.message || ''))
      ) {
        updateResult = await admin
          .from('amc_contracts')
          .update(insertBase)
          .eq('id', existingForJob.id)
          .select('id')
          .single();
      }

      if (updateResult.error) {
        return { error: updateResult.error };
      }

      return { data: updateResult.data, updated: true };
    }
  }

  await renewExistingActiveAmcs(admin, payload.customer_id);

  let result = await admin.from('amc_contracts').insert(withBrand).select('id').single();

  if (
    result.error &&
    payload.service_brand &&
    /service_brand|column/.test(String(result.error.message || ''))
  ) {
    result = await admin.from('amc_contracts').insert(insertBase).select('id').single();
  }

  if (result.error) {
    return { error: result.error };
  }

  return { data: result.data, updated: false };
}

exports.handler = async (event) => {
  const cors = corsHeaders(event);

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: cors, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, cors, { error: 'Method not allowed' });
  }

  const auth = await authorizeStaffAmcEmailRequest(event);
  if (!auth.ok) {
    return jsonResponse(403, cors, { error: auth.error || 'Unauthorized' });
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return jsonResponse(400, cors, { error: 'Invalid JSON' });
  }

  const parsed = parseBody(body);
  if (!parsed.ok) {
    return jsonResponse(400, cors, { error: parsed.error });
  }

  const payload = parsed.payload;

  // Technicians may only save AMC they are recording (given_by = self).
  if (auth.role === 'technician') {
    if (!auth.userId) {
      return jsonResponse(403, cors, { error: 'Forbidden' });
    }
    if (payload.given_by_technician_id && payload.given_by_technician_id !== auth.userId) {
      return jsonResponse(403, cors, { error: 'Forbidden' });
    }
    payload.given_by_technician_id = auth.userId;
  }

  const supabaseUrl = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '').trim();
  const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!supabaseUrl || !serviceKey) {
    return jsonResponse(500, cors, { error: 'Server misconfigured' });
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    const upsert = await upsertAmcContract(admin, payload);

    if (upsert.error) {
      console.error('[save-amc-contract] upsert failed', upsert.error.message);
      return jsonResponse(500, cors, { error: upsert.error.message || 'Failed to save AMC' });
    }

    return jsonResponse(200, cors, {
      success: true,
      id: upsert.data?.id,
      updated: Boolean(upsert.updated),
    });
  } catch (error) {
    console.error('[save-amc-contract] unexpected', error && error.message);
    return jsonResponse(500, cors, { error: 'Failed to save AMC contract' });
  }
};
