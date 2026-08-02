-- Read-only introspection for efes database audit (no mutations).
\echo === VERSION ===
SELECT version();

\echo === SCHEMAS ===
SELECT nspname FROM pg_namespace
WHERE nspname NOT LIKE 'pg_%' AND nspname <> 'information_schema'
ORDER BY 1;

\echo === TABLE COUNTS BY SCHEMA ===
SELECT schemaname, count(*) AS tables
FROM pg_tables
WHERE schemaname NOT IN ('pg_catalog','information_schema')
GROUP BY 1 ORDER BY 1;

\echo === PUBLIC TABLES + ROW ESTIMATES ===
SELECT c.relname AS table_name,
       c.reltuples::bigint AS est_rows,
       pg_size_pretty(pg_total_relation_size(c.oid)) AS total_size
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r'
ORDER BY c.relname;

\echo === AUTH TABLES ===
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'auth' ORDER BY 1;

\echo === STORAGE TABLES ===
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'storage' ORDER BY 1;

\echo === COLUMNS (public) ===
SELECT table_name, column_name, data_type, udt_name, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
ORDER BY table_name, ordinal_position;

\echo === PRIMARY KEYS ===
SELECT tc.table_name, kcu.column_name
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
WHERE tc.table_schema = 'public' AND tc.constraint_type = 'PRIMARY KEY'
ORDER BY 1, 2;

\echo === FOREIGN KEYS ===
SELECT
  tc.table_name AS from_table,
  kcu.column_name AS from_column,
  ccu.table_schema AS to_schema,
  ccu.table_name AS to_table,
  ccu.column_name AS to_column,
  rc.delete_rule,
  rc.update_rule
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage ccu
  ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
JOIN information_schema.referential_constraints rc
  ON rc.constraint_name = tc.constraint_name AND rc.constraint_schema = tc.table_schema
WHERE tc.table_schema = 'public' AND tc.constraint_type = 'FOREIGN KEY'
ORDER BY 1, 2;

\echo === UNIQUE CONSTRAINTS ===
SELECT tc.table_name, tc.constraint_name, string_agg(kcu.column_name, ', ' ORDER BY kcu.ordinal_position) AS columns
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
WHERE tc.table_schema = 'public' AND tc.constraint_type = 'UNIQUE'
GROUP BY 1, 2
ORDER BY 1, 2;

\echo === CHECK CONSTRAINTS ===
SELECT conrelid::regclass::text AS table_name, conname, pg_get_constraintdef(oid) AS def
FROM pg_constraint
WHERE contype = 'c' AND connamespace = 'public'::regnamespace
ORDER BY 1, 2;

\echo === INDEXES ===
SELECT tablename, indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
ORDER BY 1, 2;

\echo === FUNCTIONS public ===
SELECT p.proname,
       pg_get_function_identity_arguments(p.oid) AS args,
       CASE p.provolatile WHEN 'i' THEN 'IMMUTABLE' WHEN 's' THEN 'STABLE' ELSE 'VOLATILE' END AS volatility
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
ORDER BY 1;

\echo === TRIGGERS ===
SELECT event_object_table AS table_name, trigger_name, action_timing, event_manipulation
FROM information_schema.triggers
WHERE trigger_schema = 'public'
ORDER BY 1, 2;

\echo === RLS ENABLED ===
SELECT c.relname, c.relrowsecurity AS rls_enabled, c.relforcerowsecurity AS rls_forced
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r'
ORDER BY 1;

\echo === POLICIES ON ORDERS ===
SELECT polname, polcmd, pg_get_expr(polqual, polrelid) AS using_expr,
       pg_get_expr(polwithcheck, polrelid) AS with_check
FROM pg_policy
WHERE polrelid = 'public.orders'::regclass;

\echo === EXTENSIONS ===
SELECT extname, extversion FROM pg_extension ORDER BY 1;

\echo === ENUMS ===
SELECT t.typname, string_agg(e.enumlabel, ', ' ORDER BY e.enumsortorder) AS labels
FROM pg_type t
JOIN pg_enum e ON e.enumtypid = t.oid
JOIN pg_namespace n ON n.oid = t.typnamespace
WHERE n.nspname = 'public'
GROUP BY 1 ORDER BY 1;
