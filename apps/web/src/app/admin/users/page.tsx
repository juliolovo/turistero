import { adminFetch, requireRole, type Page } from "@/lib/admin";
import { Flash, Th, btn, field, fmtDateTime } from "@/components/admin-ui";
import { userRoleAction } from "../actions";

interface U { id: string; name: string | null; email: string | null; role: string; createdAt: string }

export default async function Users({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const [u, sp] = [await requireRole("ADMIN"), await searchParams];
  const users = await adminFetch<Page<U>>(u.id, "/users?pageSize=100");
  return (
    <div className="space-y-5">
      <h1 className="font-display text-3xl font-extrabold text-ink">Usuarios</h1>
      <Flash ok={sp.ok} error={sp.error} />
      <div className="overflow-x-auto rounded-2xl border border-cal-2 bg-white">
        <table className="w-full min-w-[40rem] text-sm">
          <thead className="bg-ink text-white"><tr><Th>Nombre</Th><Th>Correo</Th><Th>Alta</Th><Th>Rol</Th></tr></thead>
          <tbody>
            {users.items.map((x) => (
              <tr key={x.id} className="border-b border-cal-2">
                <td className="px-3 py-2">{x.name ?? "—"}</td><td className="px-3 py-2">{x.email ?? "—"}</td><td className="px-3 py-2">{fmtDateTime(x.createdAt)}</td>
                <td className="px-3 py-2">
                  <form action={userRoleAction} className="flex items-center gap-2">
                    <input type="hidden" name="id" value={x.id} />
                    <label htmlFor={`r-${x.id}`} className="sr-only">Rol de {x.name ?? x.email}</label>
                    <select id={`r-${x.id}`} name="role" defaultValue={x.role} className={`${field} w-32`}><option>USER</option><option>EDITOR</option><option>ADMIN</option></select>
                    <button className={btn}>Cambiar</button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
