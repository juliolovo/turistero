// Activa los hooks de .githooks (pre-commit y pre-push) para este clon. Se ejecuta con `npm install` (script "prepare").
// No hace nada si no es un repositorio git (p. ej. en el build de Vercel).
import { execFileSync } from "node:child_process";
import { chmodSync, existsSync } from "node:fs";

try {
  execFileSync("git", ["rev-parse", "--git-dir"], { stdio: "ignore" });
} catch {
  process.exit(0);
}
if (existsSync(".githooks")) {
  execFileSync("git", ["config", "core.hooksPath", ".githooks"]);
  for (const h of ["pre-commit", "pre-push"]) {
    try {
      chmodSync(`.githooks/${h}`, 0o755);
    } catch {
      /* Windows */
    }
  }
  console.log("✓ Hooks de seguridad activados (.githooks): el detector de secretos corre antes de cada commit y push.");
}
