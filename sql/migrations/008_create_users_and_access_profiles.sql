-- 008_create_users_and_access_profiles.sql
-- Usuários, perfis de acesso (permissões por tela e por ação) e sessões de login.

-- Perfis de acesso. O perfil de sistema ("Administrador") tem acesso total e não
-- pode ser alterado nem excluído pela aplicação.
CREATE TABLE IF NOT EXISTS access_profile (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    name VARCHAR(100) NOT NULL,
    description TEXT NULL,
    is_system TINYINT(1) NOT NULL DEFAULT 0,
    status TINYINT(1) NOT NULL DEFAULT 1,
    excluded TINYINT(1) NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    INDEX idx_access_profile_excluded_status (excluded, status),
    INDEX idx_access_profile_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Permissões do perfil: uma linha por tela (resource), com as ações permitidas.
-- As telas e ações possíveis são definidas no código (src/security/permissions.js).
CREATE TABLE IF NOT EXISTS access_profile_permission (
    profile_id INT UNSIGNED NOT NULL,
    resource VARCHAR(50) NOT NULL,
    can_view TINYINT(1) NOT NULL DEFAULT 0,
    can_create TINYINT(1) NOT NULL DEFAULT 0,
    can_update TINYINT(1) NOT NULL DEFAULT 0,
    can_delete TINYINT(1) NOT NULL DEFAULT 0,
    PRIMARY KEY (profile_id, resource),
    CONSTRAINT fk_access_profile_permission_profile
        FOREIGN KEY (profile_id) REFERENCES access_profile (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Usuários do sistema. Senha guardada apenas como hash (scrypt). O e-mail é único
-- entre os usuários não excluídos (verificado pela aplicação).
-- session_version: incrementado ao trocar a senha ou inativar o usuário, o que
-- encerra as sessões abertas dele.
CREATE TABLE IF NOT EXISTS app_user (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    name VARCHAR(150) NOT NULL,
    email VARCHAR(190) NOT NULL,
    phone VARCHAR(30) NULL,
    description TEXT NULL,
    photo_file VARCHAR(100) NULL,
    password_hash VARCHAR(255) NOT NULL,
    session_version INT UNSIGNED NOT NULL DEFAULT 0,
    last_login_at DATETIME NULL,
    status TINYINT(1) NOT NULL DEFAULT 1,
    excluded TINYINT(1) NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    INDEX idx_app_user_email (email),
    INDEX idx_app_user_excluded_status (excluded, status),
    INDEX idx_app_user_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Perfis de cada usuário (um usuário pode ter vários; as permissões se somam).
CREATE TABLE IF NOT EXISTS app_user_profile (
    user_id INT UNSIGNED NOT NULL,
    profile_id INT UNSIGNED NOT NULL,
    PRIMARY KEY (user_id, profile_id),
    CONSTRAINT fk_app_user_profile_user
        FOREIGN KEY (user_id) REFERENCES app_user (id) ON DELETE CASCADE,
    CONSTRAINT fk_app_user_profile_profile
        FOREIGN KEY (profile_id) REFERENCES access_profile (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Sessões de login (formato do express-mysql-session).
CREATE TABLE IF NOT EXISTS sessions (
    session_id VARCHAR(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
    expires INT UNSIGNED NOT NULL,
    data MEDIUMTEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin,
    PRIMARY KEY (session_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Perfil de sistema com acesso total
INSERT INTO access_profile (name, description, is_system, status)
SELECT 'Administrador', 'Acesso total a todas as telas e ações do sistema.', 1, 1
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM access_profile WHERE is_system = 1);
