import { createPatch } from 'diff'
import { createRoute } from 'honox/factory'
import { readFile } from 'node:fs/promises'
import { lint } from '../../lib/keymap-dt/lint'
import { resolveKeymapPath } from '../../lib/keymap-dt/repo-path'

export const POST = createRoute(async (c) => {
  const r = resolveKeymapPath()
  if (!r.ok) return c.json({ ok: false, error: r.reason }, 500)

  let body: { text?: string }
  try {
    body = await c.req.json()
  } catch {
    return c.json({ ok: false, error: 'invalid JSON body' }, 400)
  }
  if (typeof body.text !== 'string') {
    return c.json({ ok: false, error: '"text" must be a string' }, 400)
  }

  const current = await readFile(r.keymapPath, 'utf8').catch(() => '')
  const diff = createPatch('dax5.keymap', current, body.text, '', '', { context: 3 })
  const lintResult = lint(body.text)
  return c.json({ ok: true, diff, lint: lintResult })
})
