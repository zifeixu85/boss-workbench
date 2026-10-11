-- 014 数据源与导入（data）模块第三批：字段对照记住“AI 原来建议的是哪个字段”。归属：数据源与导入模块（E4）。
-- 老板点“不导”或改成别的之后，target 跟着变；suggested_target 不变，点“改回”时按它回到“等你确认”。只加列，不改已有的表结构。
ALTER TABLE field_mappings ADD COLUMN suggested_target TEXT;
UPDATE field_mappings SET suggested_target = target WHERE status = 'AI 建议';
