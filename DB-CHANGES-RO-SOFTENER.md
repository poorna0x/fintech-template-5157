# DB changes for RO + Softener (and other combos)

## What changes

Only the **customers** table: we relax the `customers_service_type_check` so it also allows `RO_SOFTENER`, `RO_AC`, `SOFTENER_AC`, and `ALL_SERVICES`. Existing allowed values stay the same.

## Effect on old data

- **No data migration.** We do not `UPDATE` or `INSERT` any rows.
- **No existing rows break.** Current allowed values are still allowed:
  - `RO`, `SOFTENER`, `AC`, `APPLIANCE`, `MULTIPLE`
- **New values only added:** `RO_SOFTENER`, `RO_AC`, `SOFTENER_AC`, `ALL_SERVICES`
- **jobs, amc_contracts, etc.** are unchanged. Only the customers check constraint is updated.

## What to run

### 1. (Optional) Pre-check

Run in Supabase SQL Editor to see current `service_type` values:

```sql
SELECT service_type, COUNT(*) 
FROM customers 
GROUP BY service_type 
ORDER BY 1;
```

All should be in `RO`, `SOFTENER`, `AC`, `APPLIANCE`, `MULTIPLE`. None of these are removed.

### 2. Apply the migration

Run the contents of **`fix-customers-service-type-constraint.sql`** in Supabase **SQL Editor**:

```sql
-- Fix customers_service_type_check to allow RO+SOFTENER and other combos
-- Run this in Supabase SQL Editor.

ALTER TABLE customers DROP CONSTRAINT IF EXISTS customers_service_type_check;

ALTER TABLE customers ADD CONSTRAINT customers_service_type_check CHECK (
  service_type::text = ANY (ARRAY[
    'RO'::text, 'SOFTENER'::text, 'AC'::text, 'APPLIANCE'::text, 'MULTIPLE'::text,
    'RO_SOFTENER'::text, 'RO_AC'::text, 'SOFTENER_AC'::text, 'ALL_SERVICES'::text
  ])
);
```

### 3. (Optional) Verify

```sql
-- Should succeed (composite types now allowed)
-- Don't actually run this unless you intend to update a test row:
-- UPDATE customers SET service_type = 'RO_SOFTENER' WHERE id = 'some-uuid';
```

## Rollback (if needed)

To revert to the **old** constraint (only `RO`, `SOFTENER`, `AC`, `APPLIANCE`, `MULTIPLE`):

```sql
ALTER TABLE customers DROP CONSTRAINT IF EXISTS customers_service_type_check;

ALTER TABLE customers ADD CONSTRAINT customers_service_type_check CHECK (
  service_type::text = ANY (ARRAY[
    'RO'::text, 'SOFTENER'::text, 'AC'::text, 'APPLIANCE'::text, 'MULTIPLE'::text
  ])
);
```

**Warning:** Rollback will fail if any row has `RO_SOFTENER`, `RO_AC`, `SOFTENER_AC`, or `ALL_SERVICES`. You’d need to change those back to a single type or `MULTIPLE` first.

## Summary

| Item              | Action                                      |
|-------------------|---------------------------------------------|
| **customers**     | Update check constraint only (no data change) |
| **jobs**          | No change                                   |
| **Other tables**  | No change                                   |
| **Old customer rows** | Unaffected                            |
