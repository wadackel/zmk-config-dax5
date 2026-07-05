import { createRoute } from 'honox/factory'
import KeyboardTester from '../islands/keyboard-tester'

export default createRoute((c) => {
  return c.render(
    <div>
      {import.meta.env.DEV && (
        <div class="px-4 py-2 text-xs font-mono text-fg-subtle border-b border-border-subtle">
          <a class="hover:text-fg" href="/">
            ← Back to keymap editor
          </a>
        </div>
      )}
      <KeyboardTester />
    </div>,
  )
})
