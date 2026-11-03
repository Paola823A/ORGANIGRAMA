CREATE TABLE user_permissions_new (
 user_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
 company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
 module TEXT NOT NULL CHECK(module IN ('graphic','board','upload')),
 PRIMARY KEY(user_id,company_id,module)
);
INSERT INTO user_permissions_new SELECT * FROM user_permissions;
DROP TABLE user_permissions;
ALTER TABLE user_permissions_new RENAME TO user_permissions;
ALTER TABLE import_batches ADD COLUMN actor_user_id TEXT REFERENCES app_users(id);
ALTER TABLE import_batches ADD COLUMN scope_json TEXT;
