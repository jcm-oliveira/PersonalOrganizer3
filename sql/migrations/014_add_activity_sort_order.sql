-- 014_add_activity_sort_order.sql
-- Sequência manual das atividades nos blocos "Ordem de Serviço" e "Lista de Compras"
-- da consulta (setas para subir/descer). Valores distintos: as existentes recebem o
-- próprio id (mantém a ordem atual); as novas entram no fim (maior valor + 1).

ALTER TABLE activity
    ADD COLUMN sort_order INT UNSIGNED NOT NULL DEFAULT 0 AFTER notify_before_minutes;

UPDATE activity SET sort_order = id;

ALTER TABLE activity
    ADD INDEX idx_activity_type_sort_order (activity_type, sort_order);
