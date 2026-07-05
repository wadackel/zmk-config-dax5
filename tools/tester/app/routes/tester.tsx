import { createRoute } from 'honox/factory'
import KeyboardTester from '../islands/keyboard-tester'

export default createRoute((c) => {
  return c.render(
    <div>
      {import.meta.env.DEV && (
        <div class="px-4 py-2 text-xs font-mono text-zinc-500 border-b border-[#1a1a1a]">
          <a class="hover:text-zinc-200" href="/">
            ← Back to keymap editor
          </a>
        </div>
      )}
      <KeyboardTester />
    </div>,
  )
})
