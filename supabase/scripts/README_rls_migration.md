# RLS optimization migration – how to apply and roll back

All commands from **project root**. Use your real DB URL (e.g. `$DATABASE_URL` or Supabase connection string).

---

## 1. Optional: test first (no changes)

Check that the migration would run without errors. **Nothing is written to the DB.**

```bash
psql "$DATABASE_URL" -f supabase/scripts/preflight_rls_migration.sql
```

If you see `Preflight OK`, you can apply for real.

---

## 2. Apply with automatic rollback on failure

Run the migration in a **single transaction**. If any step fails, the whole transaction is rolled back and the DB stays as before.

```bash
psql "$DATABASE_URL" -f supabase/scripts/apply_rls_migration_safe.sql
```

- **Success:** You see `Migration applied successfully.` and the changes are committed.
- **Failure:** Script stops at the first error and the transaction is rolled back (no changes).

---

## 3. Undo after a successful apply

If you applied the migration and **later** discover problems, restore the previous state with:

```bash
psql "$DATABASE_URL" -f supabase/scripts/rollback_rls_initplan_and_duplicate_index.sql
```

This puts the index and all affected RLS policies back to how they were before the optimization.

---

## Summary

| When | What to run |
|------|------------------|
| Test only (no changes) | `preflight_rls_migration.sql` |
| Apply (rollback automatically if it breaks) | `apply_rls_migration_safe.sql` |
| Already applied and want to undo | `rollback_rls_initplan_and_duplicate_index.sql` |
