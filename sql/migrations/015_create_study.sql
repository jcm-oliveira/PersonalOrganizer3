-- 015_create_study.sql
-- Estudos: controle dos livros (Leitura) e cursos em andamento e concluídos, com
-- anotações e arquivos anexos.
-- Concluído = evolução de 100%. A duração não é gravada: é calculada a partir das
-- datas de início e término (ou de hoje, enquanto o estudo está em aberto).

CREATE TABLE IF NOT EXISTS study (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,

    -- Identificação
    knowledge_area VARCHAR(150) NOT NULL,
    subject VARCHAR(150) NULL,
    name VARCHAR(255) NOT NULL,
    author VARCHAR(255) NULL,
    study_type VARCHAR(20) NOT NULL DEFAULT 'Leitura',

    -- Acompanhamento
    hours DECIMAL(6,1) UNSIGNED NULL,
    has_certificate TINYINT(1) NOT NULL DEFAULT 0,
    material_source VARCHAR(500) NULL,
    stop_point VARCHAR(255) NULL,
    progress TINYINT UNSIGNED NOT NULL DEFAULT 0,
    start_date DATE NULL,
    end_date DATE NULL,
    notes MEDIUMTEXT NULL,

    -- Controle e Auditoria
    excluded TINYINT(1) NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (id),
    INDEX idx_study_excluded_type (excluded, study_type),
    INDEX idx_study_progress (progress),
    INDEX idx_study_knowledge_area (knowledge_area),
    INDEX idx_study_end_date (end_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Arquivos anexos ao estudo. O arquivo fica fora de public/ (uploads/studies) com
-- nome gerado pelo sistema; o nome original é guardado apenas para exibição/download.
CREATE TABLE IF NOT EXISTS study_attachment (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    study_id INT UNSIGNED NOT NULL,
    original_name VARCHAR(255) NOT NULL,
    stored_file VARCHAR(100) NOT NULL,
    mime_type VARCHAR(150) NOT NULL,
    size_bytes INT UNSIGNED NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    INDEX idx_study_attachment_study (study_id),
    CONSTRAINT fk_study_attachment_study
        FOREIGN KEY (study_id) REFERENCES study (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
