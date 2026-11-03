ALTER TABLE app_users ADD COLUMN deleted_at TEXT;
UPDATE app_users SET status='APPROVED',must_change_password=0 WHERE status='PENDING';
