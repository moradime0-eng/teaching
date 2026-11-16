/**
 * Environment bootstrap.
 * =============================================================
 * This is the FIRST module `server.ts` (and any CLI script that needs
 * secrets) should import. Its sole job is to make sure `process.env` is
 * populated from all three sources, in this order:
 *
 *   1. `.env` file              (via `dotenv.config()`)
 *   2. Docker Swarm / k8s files (via `loadSecrets()` — `*_FILE` env vars)
 *   3. Inline shell env         (already in `process.env`, takes precedence)
 *
 * Keeping this in a dedicated module means we can also `import` it from
 * `scripts/seed-production.ts` and migrations without duplicating the
 * `dotenv.config()` + `loadSecrets()` calls.
 *
 * ⚠️  Order matters: `dotenv.config()` runs FIRST so it can populate
 * `NODE_ENV` (which `loadSecrets` consults to decide strict vs. lax
 * behaviour). Then `loadSecrets()` resolves `_FILE` overrides on top of
 * whatever dotenv already loaded. Finally the inline shell env (which
 * always wins over both) is left as-is.
 */

import dotenv from 'dotenv';

dotenv.config();

import { loadSecrets } from './secrets';
import type { LoadSecretsResult } from './secrets';

const result: LoadSecretsResult = loadSecrets();

if (result.loaded.length > 0) {
  // Log only the names — the paths are already deleted from `process.env`,
  // and the values themselves never appear in logs.
  console.log(`🔐 Loaded ${result.loaded.length} secret(s) from files: ${result.loaded.join(', ')}`);
}
