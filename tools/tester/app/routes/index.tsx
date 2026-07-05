import { createRoute } from 'honox/factory'
import KeyboardTester from '../islands/keyboard-tester'
import KeymapEditor from '../islands/keymap-editor'

// In dev mode `/` is the keymap editor (daily-use workflow). In production
// (`pnpm build` → GitHub Pages SSG) the editor is excluded — see
// `vite-plugins/dev-only-routes.ts` and `app/server.ts` — so `/` serves the
// tester instead. `import.meta.env.DEV` is statically replaced by Vite at
// build time, so the editor branch is dead-code-eliminated in production.
export default createRoute((c) => {
  if (import.meta.env.DEV) {
    return c.render(
      <div class="h-screen flex flex-col">
        <div class="px-4 py-2 text-xs font-mono text-zinc-500 border-b border-[#1a1a1a]">
          <a class="hover:text-zinc-200" href="/tester">
            → Open keyboard tester
          </a>
        </div>
        <KeymapEditor />
      </div>,
    )
  }
  return c.render(<KeyboardTester />)
})
