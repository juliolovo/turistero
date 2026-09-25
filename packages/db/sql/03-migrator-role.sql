-- Rol MIGRADOR: solo aplica migraciones (crea/altera tablas del esquema `public`). Es el que va en DATABASE_MIGRATOR_URL
-- (pipeline de despliegue y `npm run db:migrate`). A diferencia del administrador NO puede: crear ni alterar roles, cambiar
-- permisos de otros roles, ser dueño de la base de datos, crear bases de datos ni conectarse a otras bases.
-- Las tablas que crea quedan a su nombre y heredan los permisos DML de la app (ALTER DEFAULT PRIVILEGES).
--
-- Uso (como superusuario o dueño de la BD), DESPUÉS de 01 y 02. Las contraseñas van por variables de psql:
--   psql "$ADMIN_URL" -v ON_ERROR_STOP=1 -v db=turistero_db_dev -v admin_role=turistero_admin_usr \
--        -v app_role=turistero_app_usr -v migrator_role=turistero_migrator_usr -v migrator_pwd="$MIGRATOR_PWD" \
--        -f packages/db/sql/03-migrator-role.sql
-- Es idempotente y sirve también para rotar la contraseña.
--
-- ⚠️ Si tus tablas ya existían con otro dueño (p. ej. el administrador), pásalas al migrador una vez:
--   ALTER TABLE ... OWNER TO turistero_migrator_usr (y lo mismo con secuencias y el esquema `drizzle`).

SELECT format('CREATE ROLE %I LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD %L', :'migrator_role', :'migrator_pwd')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'migrator_role') \gexec

SELECT format('ALTER ROLE %I PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION', :'migrator_role', :'migrator_pwd') \gexec

-- El administrador puede "ser" el migrador (necesario en Neon/Supabase para fijar permisos por defecto en su nombre)
SELECT format('GRANT %I TO %I', :'migrator_role', :'admin_role') \gexec

-- CONNECT y CREATE (esquemas): drizzle-kit crea su esquema `drizzle` con CREATE SCHEMA IF NOT EXISTS, que exige CREATE en la BD.
SELECT format('GRANT CONNECT, CREATE ON DATABASE %I TO %I', :'db', :'migrator_role') \gexec

\connect :db

-- Puede crear objetos en `public`; el esquema sigue siendo del administrador
SELECT format('GRANT USAGE, CREATE ON SCHEMA public TO %I', :'migrator_role') \gexec

-- Lo que cree el migrador desde ahora: la app puede usarlo (solo filas), sin DDL
SELECT format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO %I', :'migrator_role', :'app_role') \gexec
SELECT format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO %I', :'migrator_role', :'app_role') \gexec
