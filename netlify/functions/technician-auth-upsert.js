/** Create or update Supabase Auth user for a technician (auth.users.id = technicians.id). */
async function upsertTechnicianAuthUser(admin, { technicianId, email, password, fullName }) {
  const normalizedEmail = String(email).toLowerCase().trim();

  const { error: createError } = await admin.auth.admin.createUser({
    id: technicianId,
    email: normalizedEmail,
    password,
    email_confirm: true,
    user_metadata: { role: 'technician', ...(fullName ? { full_name: fullName } : {}) },
    app_metadata: { role: 'technician' },
  });

  if (!createError) {
    return { ok: true, action: 'created' };
  }

  if (
    createError.message?.includes('already') ||
    createError.message?.includes('registered') ||
    createError.status === 422
  ) {
    const { data: listData } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const conflict = listData?.users?.find(
      (u) => u.email?.toLowerCase() === normalizedEmail && u.id !== technicianId
    );
    if (conflict) {
      await admin.auth.admin.deleteUser(conflict.id);
      const { error: retryError } = await admin.auth.admin.createUser({
        id: technicianId,
        email: normalizedEmail,
        password,
        email_confirm: true,
        user_metadata: { role: 'technician', ...(fullName ? { full_name: fullName } : {}) },
        app_metadata: { role: 'technician' },
      });
      if (!retryError) {
        return { ok: true, action: 'recreated' };
      }
    }
  }

  const { error: updateError } = await admin.auth.admin.updateUserById(technicianId, {
    email: normalizedEmail,
    password,
    user_metadata: { role: 'technician', ...(fullName ? { full_name: fullName } : {}) },
    app_metadata: { role: 'technician' },
  });

  if (updateError) {
    return { ok: false, error: updateError.message };
  }

  return { ok: true, action: 'updated' };
}

module.exports = { upsertTechnicianAuthUser };
