import { existsSync } from "node:fs";
import { emptyState, type IngestState } from "@kyc/core/util";
import { readData, writeData } from "./repo.ts";
import { join } from "node:path";
import { repoRoot } from "./repo.ts";

/**
 * Fs persistence for the incremental-ingestion watermark (proposal 10). State is
 * keyed per entity and source under data/state/<entityId>.<source>.json, so each
 * connector tracks its own progress independently and a re-run fetches only what
 * changed since the last watermark.
 */

const statePath = (entityId: string, source: string): string =>
  `state/${entityId}.${source}.json`;

export async function readState(entityId: string, source: string): Promise<IngestState> {
  const full = join(repoRoot, "data", statePath(entityId, source));
  if (!existsSync(full)) return emptyState();
  return readData<IngestState>(statePath(entityId, source));
}

export async function writeState(
  entityId: string,
  source: string,
  state: IngestState,
): Promise<string> {
  return writeData(statePath(entityId, source), state);
}
