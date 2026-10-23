-- 011_add_activity_notify_before.sql
-- Notificação com antecedência: quantos minutos antes do início da atividade o sistema
-- mostra o pop-up de aviso (15 min, 30 min, 1 a 5 horas ou 1 a 5 dias). Padrão: 15 minutos.

ALTER TABLE activity
    ADD COLUMN notify_before_minutes INT UNSIGNED NOT NULL DEFAULT 15 AFTER theme_organization;
