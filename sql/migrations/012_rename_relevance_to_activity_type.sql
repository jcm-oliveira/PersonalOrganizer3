-- 012_rename_relevance_to_activity_type.sql
-- O cadastro "Relevância" passa a se chamar "Tipo de Atividade": tabela de apoio,
-- coluna da atividade, índices e permissões dos perfis de acesso.
-- Os índices são recriados (DROP/ADD) em vez de RENAME INDEX, que não existe em
-- versões antigas do MariaDB.

RENAME TABLE relevance TO activity_type;

ALTER TABLE activity_type
    DROP INDEX idx_relevance_excluded_status,
    DROP INDEX idx_relevance_name,
    ADD INDEX idx_activity_type_excluded_status (excluded, status),
    ADD INDEX idx_activity_type_name (name);

ALTER TABLE activity
    CHANGE COLUMN relevance activity_type VARCHAR(50) NOT NULL DEFAULT 'Prioridade',
    DROP INDEX idx_activity_relevance,
    ADD INDEX idx_activity_activity_type (activity_type);

-- Perfis de acesso: a tela "relevance" passa a ser "activity_type"
UPDATE access_profile_permission SET resource = 'activity_type' WHERE resource = 'relevance';
