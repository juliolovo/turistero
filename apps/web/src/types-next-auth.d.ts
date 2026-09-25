import type { DefaultSession } from "next-auth";

type Role = "USER" | "EDITOR" | "ADMIN";

declare module "next-auth" {
  interface Session {
    user: { id: string; role: Role } & DefaultSession["user"];
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    uid?: string;
    role?: Role;
  }
}
