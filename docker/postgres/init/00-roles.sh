#!/bin/sh
# Se ejecuta UNA vez, al crear el volumen de datos de Postgres (docker-entrypoint-initdb.d).
# Crea el rol administrador (DDL/migraciones) y el rol de la aplicación (solo DML). Contraseñas: variables de entorno del contenedor.
set -eu

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  -v db="$POSTGRES_DB" \
  -v admin_role="$ADMIN_DB_USER" -v admin_pwd="$ADMIN_DB_PASSWORD" \
  -v app_role="$APP_DB_USER" -v app_pwd="$APP_DB_PASSWORD" \
  -f /sql/01-admin-role.sql -f /sql/02-app-role.sql

# Endurecimiento del servidor local: por defecto cualquier rol puede CONECTARSE a las bases `postgres` y `template1`.
# El rol de la aplicación solo debe poder entrar a la base de la aplicación.
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres -c "REVOKE ALL ON DATABASE postgres FROM PUBLIC" -c "REVOKE ALL ON DATABASE template1 FROM PUBLIC"

echo "✓ Roles creados: administrador=$ADMIN_DB_USER (DDL) y aplicación=$APP_DB_USER (solo filas) en $POSTGRES_DB"
