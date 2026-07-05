// Sets `process.env.DAX5_REPO_ROOT` to the path of the repo root so HonoX dev
// route handlers (which run in the Vite dev server's Node process) can resolve
// `config/dax5.keymap` deterministically.

import path from 'node:path'
import type { Plugin } from 'vite'

export function repoRoot(): Plugin {
  return {
    name: 'dax5-repo-root',
    configResolved(config) {
      // tools/tester/ is two levels below the repo root.
      const root = path.resolve(config.root, '../..')
      process.env.DAX5_REPO_ROOT = root
    },
  }
}
