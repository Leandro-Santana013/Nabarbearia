ALTER TABLE user_roles RENAME TO user_roles_legacy;

CREATE TABLE user_roles (
    business_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('client', 'barber', 'owner', 'admin', 'super_admin')),
    created_at_utc TEXT NOT NULL,
    PRIMARY KEY (business_id, user_id, role),
    FOREIGN KEY (business_id, user_id)
        REFERENCES users (business_id, id) ON DELETE RESTRICT
);

INSERT INTO user_roles (business_id, user_id, role, created_at_utc)
SELECT business_id, user_id,
       CASE WHEN role = 'owner' THEN 'admin' ELSE role END,
       created_at_utc
FROM user_roles_legacy;

INSERT OR IGNORE INTO user_roles (business_id, user_id, role, created_at_utc)
SELECT business_id, id, 'admin', strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
FROM users
WHERE email = 'dono@nabarbearia.com.br';

INSERT OR IGNORE INTO user_roles (business_id, user_id, role, created_at_utc)
SELECT business_id, id, 'super_admin', strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
FROM users
WHERE email = 'nailton@nabarbearia.com.br';

DELETE FROM user_roles
WHERE role = 'admin'
  AND user_id IN (SELECT id FROM users WHERE email = 'nailton@nabarbearia.com.br');

DELETE FROM user_roles
WHERE role = 'barber'
  AND user_id IN (SELECT id FROM users WHERE email = 'dono@nabarbearia.com.br');

DROP TABLE user_roles_legacy;
