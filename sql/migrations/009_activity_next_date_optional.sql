-- 009_activity_next_date_optional.sql
-- A data da próxima atividade deixa de ser obrigatória (atividades sem data marcada).
-- Atividades recorrentes continuam exigindo a data, validada na aplicação, pois ela é
-- o início da série.

ALTER TABLE activity
    MODIFY COLUMN next_activity_date DATE NULL;
