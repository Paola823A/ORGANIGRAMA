CREATE TABLE app_users (
 id TEXT PRIMARY KEY,
 username TEXT NOT NULL UNIQUE COLLATE NOCASE,
 display_name TEXT NOT NULL,
 employee_id TEXT REFERENCES employees(id) ON DELETE SET NULL,
 password_hash TEXT NOT NULL,
 role TEXT NOT NULL CHECK(role IN ('OWNER','MEMBER')),
 status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','APPROVED','DISABLED')),
 must_change_password INTEGER NOT NULL DEFAULT 1,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX one_owner ON app_users(role) WHERE role='OWNER';
CREATE TABLE user_permissions (
 user_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
 company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
 module TEXT NOT NULL CHECK(module IN ('graphic','board')),
 PRIMARY KEY(user_id,company_id,module)
);
CREATE TABLE user_sessions (
 token_hash TEXT PRIMARY KEY,
 user_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
 expires_at INTEGER NOT NULL
);
CREATE TABLE login_limits (
 key TEXT PRIMARY KEY,
 attempts INTEGER NOT NULL,
 expires_at INTEGER NOT NULL
);
