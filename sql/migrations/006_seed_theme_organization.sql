-- 006_seed_theme_organization.sql
-- Carga inicial de dados padrão para Organização por Tema

INSERT INTO theme_organization (name, life_sphere_id, description, status)
SELECT tmp.name, ls.id, tmp.description, 1
FROM (
    SELECT '[TI] - Escritório de Projetos' AS name, 'Profissão e Carreira' AS sphere_name, 'Projetos e demandas corporativas de tecnologia' AS description UNION ALL
    SELECT '[TI] - Sustentação e Suporte' AS name, 'Profissão e Carreira' AS sphere_name, 'Atividades operacionais e sustentação de sistemas' AS description UNION ALL
    SELECT '[Gestão] - Reuniões e Governança' AS name, 'Profissão e Carreira' AS sphere_name, 'Alinhamentos diretivos e reuniões institucionais' AS description UNION ALL
    SELECT '[Família] - Casa e Família' AS name, 'Família, Lazer e Social' AS sphere_name, 'Compromissos e cuidados familiares' AS description UNION ALL
    SELECT '[Saúde] - Consultas e Exames' AS name, 'Saúde e Disposição' AS sphere_name, 'Check-ups, consultas e cuidados preventivos' AS description UNION ALL
    SELECT '[Finanças] - Orçamento e Contas' AS name, 'Financeiro e Bens' AS sphere_name, 'Planejamento e controle financeiro' AS description UNION ALL
    SELECT '[Espiritual] - Reuniões e Deveres' AS name, 'Espiritualidade e Plenitude' AS sphere_name, 'Atividades e deveres espirituais' AS description UNION ALL
    SELECT '[Estudos] - Cursos e Certificações' AS name, 'Desenvolvimento Pessoal' AS sphere_name, 'Leitura, cursos e aprendizado contínuo' AS description
) AS tmp
LEFT JOIN life_sphere ls ON ls.name = tmp.sphere_name
WHERE NOT EXISTS (SELECT 1 FROM theme_organization LIMIT 1);
