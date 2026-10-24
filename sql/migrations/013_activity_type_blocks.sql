-- 013_activity_type_blocks.sql
-- A consulta de atividades passa a ser dividida em blocos por Tipo de Atividade:
-- "Programada" (à esquerda, também com qualquer outro tipo), "Ordem de Serviço" e
-- "Lista de Compras" (à direita).
-- 1) Garante os três tipos no cadastro.
-- 2) Converte as atividades com os tipos antigos (Prioridade, Normal, Baixa, Backlog)
--    para "Programada" e tira esses tipos antigos das opções (exclusão lógica).
-- 3) Ordem de Serviço e Lista de Compras não têm data: com data, a atividade é
--    "Programada" (mesma regra aplicada pela aplicação ao gravar uma data).
-- 4) "Programada" passa a ser o padrão das novas atividades.

INSERT INTO activity_type (name, description, status)
SELECT t.name, t.description, 1
FROM (
    SELECT 'Programada' AS name, 'Atividades com data programada' AS description
    UNION ALL SELECT 'Ordem de Serviço', 'Serviços a executar ou acompanhar'
    UNION ALL SELECT 'Lista de Compras', 'Itens a comprar'
) t
WHERE NOT EXISTS (SELECT 1 FROM activity_type a WHERE a.name = t.name AND a.excluded = 0);

UPDATE activity
SET activity_type = 'Programada'
WHERE activity_type IN ('Prioridade', 'Normal', 'Baixa', 'Backlog');

UPDATE activity_type
SET excluded = 1
WHERE name IN ('Prioridade', 'Normal', 'Baixa', 'Backlog') AND excluded = 0;

UPDATE activity
SET activity_type = 'Programada'
WHERE activity_type IN ('Ordem de Serviço', 'Lista de Compras') AND next_activity_date IS NOT NULL;

ALTER TABLE activity
    ALTER COLUMN activity_type SET DEFAULT 'Programada';
