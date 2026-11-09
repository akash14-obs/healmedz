-- Patients sign in with a mobile number; labs and admins keep signing in with email.

ALTER TABLE app_user DROP CONSTRAINT app_user_role_check;
ALTER TABLE app_user ADD CONSTRAINT app_user_role_check CHECK (role IN ('PROVIDER', 'ADMIN', 'PATIENT'));

ALTER TABLE app_user ALTER COLUMN email DROP NOT NULL;
ALTER TABLE app_user ADD COLUMN full_name TEXT, ADD COLUMN phone TEXT;
ALTER TABLE app_user ADD CONSTRAINT app_user_has_login CHECK (email IS NOT NULL OR phone IS NOT NULL);
CREATE UNIQUE INDEX ux_app_user_patient_phone ON app_user (phone) WHERE role = 'PATIENT';

ALTER TABLE booking ADD COLUMN patient_user_id BIGINT REFERENCES app_user (id);
