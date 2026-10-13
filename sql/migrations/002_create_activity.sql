-- Tabela de Atividades (Painel de Voo / Gerenciador de Atividades)
-- Segue as convenções das seções 6.1 e 13 de docs/ARQUITETURA.md
CREATE TABLE IF NOT EXISTS activity (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,

    -- Informações Obrigatórias
    life_sphere VARCHAR(100) NOT NULL,
    description VARCHAR(255) NOT NULL,
    relevance VARCHAR(50) NOT NULL DEFAULT 'Prioridade',
    next_activity_date DATE NOT NULL,

    -- Informações Complementares
    final_deadline DATE NULL,
    day_period VARCHAR(50) NULL,
    scheduled_time TIME NULL,
    periodicity VARCHAR(50) NULL,
    action_type VARCHAR(100) NULL,
    theme_organization VARCHAR(150) NULL,
    notes TEXT NULL,

    -- Controle e Auditoria
    status TINYINT(1) NOT NULL DEFAULT 1,
    excluded TINYINT(1) NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (id),
    INDEX idx_activity_excluded_status (excluded, status),
    INDEX idx_activity_next_date (next_activity_date),
    INDEX idx_activity_final_deadline (final_deadline),
    INDEX idx_activity_life_sphere (life_sphere),
    INDEX idx_activity_relevance (relevance)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
