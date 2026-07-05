// Resolve the location of `config/dax5.keymap` for server-side endpoints.
//
// In dev mode the `repoRoot` vite plugin sets `process.env.DAX5_REPO_ROOT`.
// In tests we may set the env var explicitly. Fallback: `cwd/../..` (assumes
// the dev server was launched from `tools/tester/`).

import { existsSync } from 'node:fs'
import path from 'node:path'

const KEYMAP_RELATIVE = path.join('config', 'dax5.keymap')

export type KeymapPathResult =
  | { ok: true; repoRoot: string; keymapPath: string }
  | { ok: false; reason: 'repo root not found' }

export function resolveKeymapPath(): KeymapPathResult {
  const candidates = [
    process.env.DAX5_REPO_ROOT,
    path.resolve(process.cwd(), '..', '..'),
  ].filter((p): p is string => typeof p === 'string' && p.length > 0)

  for (const root of candidates) {
    const candidatePath = path.join(root, KEYMAP_RELATIVE)
    if (existsSync(candidatePath)) {
      return { ok: true, repoRoot: root, keymapPath: candidatePath }
    }
  }
  return { ok: false, reason: 'repo root not found' }
}
