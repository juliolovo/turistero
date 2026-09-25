-- Rol de la APLICACIÓN (menor privilegio): puede leer y escribir FILAS, pero NO puede crear, alterar ni eliminar tablas
-- (ni esquemas, roles, bases de datos, ni vaciar tablas con TRUNCATE). Es el que va en DATABASE_URL de la API.
--
-- Uso (como superusuario o dueño de la BD). Las contraseñas van por variables de psql:
--   psql "$ADMIN_URL" -v ON_ERROR_STOP=1 -v db=turistero_db_dev \
--        -v admin_role=turistero_admin_usr -v app_role=turistero_app_usr -v app_pwd="$APP_PWD" -f packages/db/sql/02-app-role.sql
--
--   * `admin_role` = el rol que crea las tablas (el de las migraciones). En Neon suele ser `neondb_owner`.
--   * Ejecútalo DESPUÉS de las migraciones o antes: las tablas nuevas heredan los permisos (ALTER DEFAULT PRIVILEGES),
--     y las existentes se cubren al final. Es idempotente y sirve también para rotar la contraseña.

SELECT format('CREATE ROLE %I LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD %L', :'app_role', :'app_pwd')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'app_role') \gexec

SELECT format('ALTER ROLE %I PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE', :'app_role', :'app_pwd') \gexec

-- Solo puede conectarse a esta base de datos
SELECT format('REVOKE ALL ON DATABASE %I FROM PUBLIC', :'db') \gexec
SELECT format('GRANT CONNECT ON DATABASE %I TO %I', :'db', :'app_role') \gexec
SELECT format('GRANT CONNECT, CREATE ON DATABASE %I TO %I', :'db', :'admin_role') \gexec

\connect :db

-- El esquema public: solo el administrador puede crear objetos; la app solo puede usarlos
SELECT format('ALTER SCHEMA public OWNER TO %I', :'admin_role') \gexec
REVOKE ALL ON SCHEMA public FROM PUBLIC;
SELECT format('GRANT USAGE ON SCHEMA public TO %I', :'app_role') \gexec

-- Tablas y secuencias que cree el administrador (migraciones) desde ahora: SELECT/INSERT/UPDATE/DELETE y uso de secuencias.
-- Sin TRUNCATE, REFERENCES, TRIGGER ni permisos de DDL.
SELECT format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO %I', :'admin_role', :'app_role') \gexec
SELECT format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO %I', :'admin_role', :'app_role') \gexec

-- Objetos que ya existan
SELECT format('GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO %I', :'app_role') \gexec
SELECT format('GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO %I', :'app_role') \gexec

-- El esquema `drizzle` (historial de migraciones) es solo del administrador: la app no recibe ningún permiso sobre él.
