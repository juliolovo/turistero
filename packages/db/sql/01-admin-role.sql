-- Rol ADMINISTRADOR de esquema: dueño de la base de datos y de las tablas. Es el ÚNICO que puede crear/alterar/eliminar tablas
-- y el que ejecuta las migraciones (`npm run db:migrate` con DATABASE_ADMIN_URL). La aplicación NO usa este rol.
--
-- Uso (como superusuario o propietario del servidor). Las contraseñas van por variables de psql: no se guardan en el archivo.
--   psql "$SUPERUSER_URL" -v ON_ERROR_STOP=1 -v db=turistero_db_dev \
--        -v admin_role=turistero_admin_usr -v admin_pwd="$ADMIN_PWD" -f packages/db/sql/01-admin-role.sql
--
-- En Neon el rol dueño ya existe (`neondb_owner`) y basta con saltar este archivo: usa ese rol como `admin_role` en 02-app-role.sql.
-- Es idempotente: se puede ejecutar de nuevo (también para rotar la contraseña).

SELECT format('CREATE ROLE %I LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD %L', :'admin_role', :'admin_pwd')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'admin_role') \gexec

SELECT format('ALTER ROLE %I PASSWORD %L', :'admin_role', :'admin_pwd') \gexec

-- El administrador es dueño de la base de datos y podrá crear tablas en `public`
SELECT format('ALTER DATABASE %I OWNER TO %I', :'db', :'admin_role') \gexec
