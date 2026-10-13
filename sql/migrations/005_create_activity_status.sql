-- 005_create_activity_status.sql
-- Tabela de apoio para Status de Atividade
-- Atributos: Nome, Descrição, Visibilidade (se aparece por padrão na listagem ou fica oculto) e Cor do texto (código HTML)

CREATE TABLE IF NOT EXISTS activity_status (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    name VARCHAR(50) NOT NULL,
    description TEXT NULL,
    visibility TINYINT(1) NOT NULL DEFAULT 1,
    color_code VARCHAR(20) NOT NULL DEFAULT '#212529',
    status TINYINT(1) NOT NULL DEFAULT 1,
    excluded TINYINT(1) NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    INDEX idx_activity_status_excluded_status (excluded, status),
    INDEX idx_activity_status_visibility (visibility),
    INDEX idx_activity_status_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Carga inicial de dados padrão para Status de Atividade
INSERT INTO activity_status (name, description, visibility, color_code, status)
SELECT * FROM (
    SELECT 'Ativo' AS name, 'Atividade em andamento / visível por padrão' AS description, 1 AS visibility, '#28a745' AS color_code, 1 AS status UNION ALL
    SELECT 'Pendente' AS name, 'Atividade pendente de início / visível por padrão' AS description, 1 AS visibility, '#007bff' AS color_code, 1 AS status UNION ALL
    SELECT 'Concluído' AS name, 'Atividade já finalizada / oculta por padrão na rotina diária' AS description, 0 AS visibility, '#6c757d' AS color_code, 1 AS status UNION ALL
    SELECT 'Cancelado' AS name, 'Atividade cancelada / oculta por padrão na rotina diária' AS description, 0 AS visibility, '#dc3545' AS color_code, 1 AS status UNION ALL
    SELECT 'Inativo' AS name, 'Atividade inativada' AS description, 0 AS visibility, '#343a40' AS color_code, 1 AS status
) AS tmp
WHERE NOT EXISTS (SELECT 1 FROM activity_status LIMIT 1);
