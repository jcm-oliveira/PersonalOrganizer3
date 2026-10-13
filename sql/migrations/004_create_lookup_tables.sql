-- Tabelas de apoio para Cadastros de Atividades
-- Segue as convenções de docs/ARQUITETURA.md

-- 1. Esfera da Vida (Nome, Descrição, Cor da linha [código HTML] e Status)
CREATE TABLE IF NOT EXISTS life_sphere (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    name VARCHAR(100) NOT NULL,
    description TEXT NULL,
    color_code VARCHAR(20) NOT NULL DEFAULT '#007bff',
    status TINYINT(1) NOT NULL DEFAULT 1,
    excluded TINYINT(1) NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    INDEX idx_life_sphere_excluded_status (excluded, status),
    INDEX idx_life_sphere_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Relevância (Nome, Descrição e Status)
CREATE TABLE IF NOT EXISTS relevance (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    name VARCHAR(50) NOT NULL,
    description TEXT NULL,
    status TINYINT(1) NOT NULL DEFAULT 1,
    excluded TINYINT(1) NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    INDEX idx_relevance_excluded_status (excluded, status),
    INDEX idx_relevance_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Período do Dia (Nome, Descrição e Status)
CREATE TABLE IF NOT EXISTS day_period (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    name VARCHAR(50) NOT NULL,
    description TEXT NULL,
    status TINYINT(1) NOT NULL DEFAULT 1,
    excluded TINYINT(1) NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    INDEX idx_day_period_excluded_status (excluded, status),
    INDEX idx_day_period_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Periodicidade (Nome, Descrição e Status)
CREATE TABLE IF NOT EXISTS periodicity (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    name VARCHAR(50) NOT NULL,
    description TEXT NULL,
    status TINYINT(1) NOT NULL DEFAULT 1,
    excluded TINYINT(1) NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    INDEX idx_periodicity_excluded_status (excluded, status),
    INDEX idx_periodicity_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. Tipo de Ação (Nome, Descrição e Status)
CREATE TABLE IF NOT EXISTS action_type (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    name VARCHAR(100) NOT NULL,
    description TEXT NULL,
    status TINYINT(1) NOT NULL DEFAULT 1,
    excluded TINYINT(1) NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    INDEX idx_action_type_excluded_status (excluded, status),
    INDEX idx_action_type_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 6. Organização por Tema (Nome, Esfera da Vida, Descrição e Status)
CREATE TABLE IF NOT EXISTS theme_organization (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    name VARCHAR(150) NOT NULL,
    life_sphere_id INT UNSIGNED NULL,
    description TEXT NULL,
    status TINYINT(1) NOT NULL DEFAULT 1,
    excluded TINYINT(1) NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    INDEX idx_theme_org_excluded_status (excluded, status),
    INDEX idx_theme_org_life_sphere (life_sphere_id),
    INDEX idx_theme_org_name (name),
    CONSTRAINT fk_theme_org_life_sphere FOREIGN KEY (life_sphere_id) REFERENCES life_sphere (id) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Carga inicial de dados padrão para as tabelas (se estiverem vazias)
INSERT INTO life_sphere (name, description, color_code, status)
SELECT * FROM (
    SELECT 'Profissão e Carreira' AS name, 'Atividades profissionais e desenvolvimento de carreira' AS description, '#007bff' AS color_code, 1 AS status UNION ALL
    SELECT 'Família, Lazer e Social', 'Compromissos e momentos com família e amigos', '#28a745', 1 UNION ALL
    SELECT 'Saúde e Disposição', 'Cuidados de saúde, exercícios e bem-estar', '#17a2b8', 1 UNION ALL
    SELECT 'Financeiro e Bens', 'Gestão financeira e patrimonial', '#ffc107', 1 UNION ALL
    SELECT 'Espiritualidade e Plenitude', 'Vida e deveres espirituais', '#6f42c1', 1 UNION ALL
    SELECT 'Desenvolvimento Pessoal', 'Estudos, leitura e metas pessoais', '#fd7e14', 1
) AS tmp
WHERE NOT EXISTS (SELECT 1 FROM life_sphere LIMIT 1);

INSERT INTO relevance (name, description, status)
SELECT * FROM (
    SELECT 'Prioridade' AS name, 'Atividades que devem ser tratadas com foco prioritário' AS description, 1 AS status UNION ALL
    SELECT 'Normal', 'Atividades do fluxo regular', 1 UNION ALL
    SELECT 'Baixa', 'Atividades sem urgência', 1 UNION ALL
    SELECT 'Backlog', 'Itens a serem avaliados futuramente', 1
) AS tmp
WHERE NOT EXISTS (SELECT 1 FROM relevance LIMIT 1);

INSERT INTO day_period (name, description, status)
SELECT * FROM (
    SELECT '1 - Manhã' AS name, 'Período matutino' AS description, 1 AS status UNION ALL
    SELECT '2 - Tarde', 'Período vespertino', 1 UNION ALL
    SELECT '3 - Noite', 'Período noturno', 1
) AS tmp
WHERE NOT EXISTS (SELECT 1 FROM day_period LIMIT 1);

INSERT INTO periodicity (name, description, status)
SELECT * FROM (
    SELECT 'Única' AS name, 'Atividade pontual sem repetição' AS description, 1 AS status UNION ALL
    SELECT 'Diária', 'Repetição todo dia', 1 UNION ALL
    SELECT 'Semanal', 'Repetição a cada semana', 1 UNION ALL
    SELECT 'Quinzenal', 'Repetição a cada duas semanas', 1 UNION ALL
    SELECT 'Mensal', 'Repetição a cada mês', 1 UNION ALL
    SELECT 'Bimestral', 'Repetição a cada dois meses', 1 UNION ALL
    SELECT 'Semestral', 'Repetição a cada seis meses', 1 UNION ALL
    SELECT 'Anual', 'Repetição uma vez por ano', 1
) AS tmp
WHERE NOT EXISTS (SELECT 1 FROM periodicity LIMIT 1);

INSERT INTO action_type (name, description, status)
SELECT * FROM (
    SELECT 'Compromisso' AS name, 'Reunião ou evento com horário fixo' AS description, 1 AS status UNION ALL
    SELECT 'Tarefa', 'Ação operacional a realizar', 1 UNION ALL
    SELECT 'Reunião', 'Encontro formal de alinhamento', 1 UNION ALL
    SELECT 'Arquitetura de Solução', 'Design ou modelagem de sistema', 1 UNION ALL
    SELECT 'Acompanhamento', 'Follow-up de atividades pendentes', 1 UNION ALL
    SELECT 'Ligação / Mensagem', 'Contato direto', 1 UNION ALL
    SELECT 'Estudo / Leitura', 'Capacitação e análise técnica', 1
) AS tmp
WHERE NOT EXISTS (SELECT 1 FROM action_type LIMIT 1);
