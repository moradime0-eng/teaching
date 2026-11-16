/**
 * Docker Swarm / Kubernetes secrets loader.
 * =============================================================
 * Implements the standard `_FILE` environment variable convention used by
 * `docker-entrypoint.sh`, Postgres, MongoDB, and many official images:
 *
 *   If `SOME_SECRET_FILE` is set, the actual secret value is read from the
 *   file path it points to (e.g. `/run/secrets/jwt_access_secret`) and the
 *   trimmed contents are assigned to `process.env.SOME_SECRET`.
 *
 *   If `SOME_SECRET_FILE` is NOT set, the loader falls through and the
 *   existing `SOME_SECRET` env var (from `dotenv` / shell / Swarm env block)
 *   is left untouched.
 *
 * This lets the same image run in:
 *   - Local dev    → reads from `.env`        (no `_FILE` set)
 *   - Docker Swarm → Swarm secrets mounted at `/run/secrets/...`
 *   - Kubernetes   → secrets projected as files
 *
 * SECURITY:
 *   - The `_FILE` variable itself is deleted from `process.env` after load
 *     so the path doesn't leak to child processes / logs.
 *   - File contents are trimmed of trailing whitespace/newlines (a common
 *     gotcha when secret files are generated with `echo`).
 *   - In production, a missing/unreadable file fails fast with a clear
 *     error pointing to the offending secret name.
 */

import fs from 'fs';

const FILE_SUFFIX = '_FILE';

export interface LoadSecretsOptions {
  /**
   * If true, throw on a missing/unreadable secret file. Defaults to true in
   * production, false otherwise — matches the existing `validateEnvironment`
   * behaviour where dev mode tolerates missing optional config.
   */
  strict?: boolean;
}

export interface LoadSecretsResult {
  loaded: string[]; // base variable names that were populated from a `_FILE`
  skipped: string[]; // base variable names whose `_FILE` was set but empty/missing
}

/**
 * Resolve every `*_FILE` environment variable into its base counterpart.
 *
 * Must be called BEFORE any module that reads `process.env` at import time
 * (e.g. `config/passport.ts`, `config/email.ts`, `config/cloudinary.ts`).
 * In practice, that means: first thing after `dotenv.config()` in
 * `server.ts`.
 */
export function loadSecrets(options: LoadSecretsOptions = {}): LoadSecretsResult {
  const isProd = process.env.NODE_ENV === 'production';
  const strict = options.strict ?? isProd;

  const loaded: string[] = [];
  const skipped: string[] = [];

  for (const [key, filePath] of Object.entries(process.env)) {
    if (!key.endsWith(FILE_SUFFIX)) continue;
    if (!filePath) continue; // VAR_FILE="" → treat as unset

    const baseVar = key.slice(0, -FILE_SUFFIX.length);
    // Skip if the base var is already set to a non-empty value — the caller
    // is explicitly overriding the file-based secret with an inline one.
    // (This makes local `SOME_SECRET=dev-value SOME_SECRET_FILE=...` work
    // predictably for debugging without editing the stack template.)
    if (process.env[baseVar] && process.env[baseVar]!.length > 0) {
      delete process.env[key];
      continue;
    }

    let value: string;
    try {
      value = fs.readFileSync(filePath, 'utf8');
    } catch (err) {
      const msg = `❌ Failed to read secret file for ${baseVar} at ${filePath}: ${(err as Error).message}`;
      if (strict) {
        throw new Error(msg);
      }
      console.warn(msg);
      skipped.push(baseVar);
      delete process.env[key];
      continue;
    }

    value = value.trim();
    if (value.length === 0) {
      const msg = `❌ Secret file for ${baseVar} is empty: ${filePath}`;
      if (strict) {
        throw new Error(msg);
      }
      console.warn(msg);
      skipped.push(baseVar);
      delete process.env[key];
      continue;
    }

    process.env[baseVar] = value;
    delete process.env[key]; // Don't leak the path to child processes / logs
    loaded.push(baseVar);
  }

  return { loaded, skipped };
}
