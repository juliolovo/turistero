import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb } from "./client";

/**
 * Comprueba el modelo de permisos de Postgres (packages/db/sql/*.sql):
 *   - rol ADMIN: dueño de la BD y del esquema; crea roles y permisos;
 *   - rol MIGRADOR: solo aplica migraciones (crea/altera/elimina tablas); sin poder sobre roles ni otras bases;
 *   - rol APP (el de DATABASE_URL): solo SELECT/INSERT/UPDATE/DELETE; sin DDL, sin TRUNCATE, sin crear roles/bases/esquemas.
 * Requiere un Postgres preparado con esos roles (`npm run db:up`). Sin las variables, las pruebas se omiten:
 *   TEST_ADMIN_DATABASE_URL=postgres://turistero_admin_usr:...@127.0.0.1:5433/turistero_db_dev
 *   TEST_MIGRATOR_DATABASE_URL=postgres://turistero_migrator_usr:...@127.0.0.1:5433/turistero_db_dev
 *   TEST_APP_DATABASE_URL=postgres://turistero_app_usr:...@127.0.0.1:5433/turistero_db_dev
 */
const adminUrl = process.env.TEST_ADMIN_DATABASE_URL;
const migratorUrl = process.env.TEST_MIGRATOR_DATABASE_URL;
const appUrl = process.env.TEST_APP_DATABASE_URL;

describe.skipIf(!adminUrl || !appUrl || !migratorUrl)("permisos de los roles de Postgres", () => {
  let admin: postgres.Sql;
  let migrator: postgres.Sql;
  let app: postgres.Sql;
  const rejects = async (q: Promise<unknown>, re: RegExp) => {
    let msg = "";
    try {
      await q;
    } catch (e) {
      msg = (e as Error).message;
    }
    expect(msg, "la operación debió ser rechazada").toMatch(re);
  };

  beforeAll(async () => {
    const m = await createDb({ url: migratorUrl!, migrate: true }); // el MIGRADOR aplica las migraciones
    await m.close();
    admin = postgres(adminUrl!, { max: 1, onnotice: () => {} });
    migrator = postgres(migratorUrl!, { max: 1, onnotice: () => {} });
    app = postgres(appUrl!, { max: 1, onnotice: () => {} });
  }, 60_000);
  afterAll(async () => {
    await admin?.end();
    await migrator?.end();
    await app?.end();
  });

  it("los roles no son superusuarios ni pueden crear bases de datos o roles", async () => {
    const r = await admin`select rolname, rolsuper, rolcreatedb, rolcreaterole from pg_roles where rolname in (current_user, ${new URL(appUrl!).username}, ${new URL(migratorUrl!).username})`;
    expect(r).toHaveLength(3);
    for (const x of r) expect([x.rolsuper, x.rolcreatedb, x.rolcreaterole]).toEqual([false, false, false]);
  });

  it("la aplicación puede leer y escribir filas (SELECT, INSERT, UPDATE, DELETE)", async () => {
    const id = `roles-test-${Date.now()}`;
    await app`insert into venue (id, name, country) values (${id}, 'Prueba', 'NI')`;
    expect((await app`select name from venue where id = ${id}`)[0]?.name).toBe("Prueba");
    await app`update venue set name = 'Editada' where id = ${id}`;
    expect((await app`select name from venue where id = ${id}`)[0]?.name).toBe("Editada");
    await app`delete from venue where id = ${id}`;
    expect(await app`select id from venue where id = ${id}`).toHaveLength(0);
  });

  it("la aplicación NO puede crear, alterar ni eliminar tablas", async () => {
    await rejects(app`create table intruso (id int)`, /permission denied for schema public/);
    await rejects(app`drop table source`, /must be owner of table source/);
    await rejects(app`alter table source add column pirata text`, /must be owner of table source/);
    await rejects(app`drop table event cascade`, /must be owner/);
    await rejects(app`create index intruso_idx on source (name)`, /must be owner of table source/);
    await rejects(app`drop schema public cascade`, /must be owner of schema public/);
  });

  it("la aplicación NO puede vaciar tablas ni saltarse restricciones", async () => {
    await rejects(app`truncate table source cascade`, /permission denied for table/);
    await rejects(app`alter table source disable trigger all`, /must be owner/);
    // GRANT sin ser dueño no falla: Postgres avisa y NO concede nada. Se comprueba que no se otorgó nada a PUBLIC.
    await app`grant all on table source to public`;
    expect(await admin`select 1 from information_schema.role_table_grants where table_name = 'source' and grantee = 'PUBLIC'`).toHaveLength(0);
  });

  it("la aplicación NO puede crear esquemas, roles ni bases de datos", async () => {
    await rejects(app`create schema intruso`, /permission denied for database/);
    await rejects(app`create role intruso login`, /(permission denied|must have CREATEROLE)/i);
    await rejects(app`create database intruso`, /permission denied to create database/);
  });

  it("la aplicación NO ve el historial de migraciones ni otras bases de datos", async () => {
    await rejects(app`select * from drizzle.__drizzle_migrations`, /permission denied for schema drizzle/);
    const other = postgres(appUrl!.replace(/\/[^/?]+(\?|$)/, "/postgres$1"), { max: 1, onnotice: () => {} });
    await rejects(other`select 1`, /permission denied for database|no pg_hba|database "postgres"/i);
    await other.end().catch(() => {});
  });

  it("el migrador NO puede administrar roles, permisos ni otras bases de datos", async () => {
    const app = new URL(appUrl!).username;
    await rejects(migrator`create role intruso login`, /(permission denied|must have CREATEROLE)/i);
    await rejects(migrator.unsafe(`alter role ${app} password 'otra'`), /(permission denied|must have CREATEROLE)/i);
    await rejects(migrator`create database intruso`, /permission denied to create database/);
    await rejects(migrator.unsafe(`alter database ${new URL(migratorUrl!).pathname.slice(1)} owner to ${new URL(migratorUrl!).username}`), /must be owner/);
    const other = postgres(migratorUrl!.replace(/\/[^/?]+(\?|$)/, "/postgres$1"), { max: 1, onnotice: () => {} });
    await rejects(other`select 1`, /permission denied for database|no pg_hba|database "postgres"/i);
    await other.end().catch(() => {});
  });

  it("el migrador sí puede modificar el esquema, y las tablas nuevas quedan usables por la app", async () => {
    await migrator`create table migrator_test_tmp (id int primary key, v text)`;
    try {
      await app`insert into migrator_test_tmp values (1, 'ok')`; // permisos por defecto (ALTER DEFAULT PRIVILEGES)
      expect((await app`select v from migrator_test_tmp where id = 1`)[0]?.v).toBe("ok");
      await rejects(app`drop table migrator_test_tmp`, /must be owner of table migrator_test_tmp/);
      await migrator`alter table migrator_test_tmp add column extra text`;
    } finally {
      await migrator`drop table if exists migrator_test_tmp`;
    }
  });

  it("el administrador sí puede modificar el esquema, y las tablas nuevas quedan usables por la app", async () => {
    await admin`create table roles_test_tmp (id int primary key, v text)`;
    try {
      await app`insert into roles_test_tmp values (1, 'ok')`; // permisos por defecto (ALTER DEFAULT PRIVILEGES)
      expect((await app`select v from roles_test_tmp where id = 1`)[0]?.v).toBe("ok");
      await rejects(app`drop table roles_test_tmp`, /must be owner of table roles_test_tmp/);
    } finally {
      await admin`drop table if exists roles_test_tmp`;
    }
  });
});
