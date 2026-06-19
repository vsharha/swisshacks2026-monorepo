import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** Walk up from this file to the workspace root (dir holding pnpm-workspace.yaml). */
function findRepoRoot(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  while (dir !== dirname(dir)) {
    if (existsSync(join(dir, "pnpm-workspace.yaml"))) return dir;
    dir = dirname(dir);
  }
  throw new Error("Could not locate repo root (pnpm-workspace.yaml not found)");
}

export const repoRoot = findRepoRoot();

/** Load the repo-root .env into process.env. No-op if the file is absent. */
export function loadRootEnv(): void {
  const envPath = join(repoRoot, ".env");
  if (existsSync(envPath)) process.loadEnvFile(envPath);
}

/** Write pretty JSON under data/, creating parent directories as needed. */
export async function writeData(relPath: string, value: unknown): Promise<string> {
  const full = join(repoRoot, "data", relPath);
  await mkdir(dirname(full), { recursive: true });
  await writeFile(full, JSON.stringify(value, null, 2) + "\n", "utf8");
  return full;
}
