-- ============================================================
-- Phase 13B — Banking Information moves from employee_salary_assignments
-- (payroll-internal, one row per CTC/structure change) to Employee Master
-- (`users`) as the canonical source. Unlike the non-destructive removals in
-- 041/042 (inert, decorative fields), this is a real DROP of the old
-- columns after backfill — leaving a stale, unsynced second copy of live
-- financial data behind would itself be a correctness/security hazard, not
-- a safe rollback net.
--
-- bank_ifsc_code/bank_branch/bank_upi_id are new names (Branch and UPI ID
-- didn't exist before at all; IFSC replaces the old generic
-- "bank_routing_code" name) since these are new columns on a new table, not
-- an in-place rename.
-- ============================================================

IF COL_LENGTH('users', 'bank_account_holder_name') IS NULL
    ALTER TABLE users ADD bank_account_holder_name NVARCHAR(150) NULL;
GO

IF COL_LENGTH('users', 'bank_name') IS NULL
    ALTER TABLE users ADD bank_name NVARCHAR(150) NULL;
GO

IF COL_LENGTH('users', 'bank_branch') IS NULL
    ALTER TABLE users ADD bank_branch NVARCHAR(150) NULL;
GO

IF COL_LENGTH('users', 'bank_account_number') IS NULL
    ALTER TABLE users ADD bank_account_number NVARCHAR(50) NULL;
GO

IF COL_LENGTH('users', 'bank_ifsc_code') IS NULL
    ALTER TABLE users ADD bank_ifsc_code NVARCHAR(20) NULL;
GO

IF COL_LENGTH('users', 'bank_upi_id') IS NULL
    ALTER TABLE users ADD bank_upi_id NVARCHAR(100) NULL;
GO

-- Backfill from each user's currently-open assignment — the "current" bank
-- details on record. Guarded by COL_LENGTH so this UPDATE only runs once,
-- before the DROP COLUMN below removes its source columns.
IF COL_LENGTH('employee_salary_assignments', 'bank_account_holder_name') IS NOT NULL
UPDATE u
SET u.bank_account_holder_name = esa.bank_account_holder_name,
    u.bank_name = esa.bank_name,
    u.bank_account_number = esa.bank_account_number,
    u.bank_ifsc_code = esa.bank_routing_code
FROM users u
JOIN employee_salary_assignments esa ON esa.user_id = u.id AND esa.tenant_id = u.tenant_id
WHERE esa.effective_to IS NULL;
GO

IF COL_LENGTH('employee_salary_assignments', 'bank_account_holder_name') IS NOT NULL
    ALTER TABLE employee_salary_assignments DROP COLUMN bank_account_holder_name;
GO

IF COL_LENGTH('employee_salary_assignments', 'bank_account_number') IS NOT NULL
    ALTER TABLE employee_salary_assignments DROP COLUMN bank_account_number;
GO

IF COL_LENGTH('employee_salary_assignments', 'bank_name') IS NOT NULL
    ALTER TABLE employee_salary_assignments DROP COLUMN bank_name;
GO

IF COL_LENGTH('employee_salary_assignments', 'bank_routing_code') IS NOT NULL
    ALTER TABLE employee_salary_assignments DROP COLUMN bank_routing_code;
GO
