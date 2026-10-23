-- 010_add_activity_duration.sql
-- Duração da atividade em horas (ex.: 1.50 = 1h30). Com o horário, define o término
-- do evento no calendário (início + duração). NULL = sem duração definida.

ALTER TABLE activity
    ADD COLUMN duration_hours DECIMAL(4,2) NULL AFTER scheduled_time;
