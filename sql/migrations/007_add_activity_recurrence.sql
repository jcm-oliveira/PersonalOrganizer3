-- 007_add_activity_recurrence.sql
-- Atividade recorrente: regra de repetição no padrão iCalendar (RFC 5545 RRULE),
-- ex.: "FREQ=MONTHLY;BYDAY=SA;BYSETPOS=2" (todo segundo sábado) ou
-- "FREQ=MONTHLY;BYMONTHDAY=15" (todo dia 15). NULL = atividade não recorrente.
-- A data de início da série é a data da próxima atividade.

ALTER TABLE activity
    ADD COLUMN recurrence_rule VARCHAR(255) NULL AFTER periodicity;
