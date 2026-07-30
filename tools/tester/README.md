# dax5 tester + keymap editor

A small Vite + HonoX app that doubles as:

1. **Editor** (`/` in dev) — a local-only editor for `config/dax5.keymap`. Edits the file on disk via a small server-side API and produces a diff preview before save. **Dev mode only** — the production GitHub Pages build serves the tester at `/` instead and does not include any editor surface.
2. **Tester** (`/tester` in dev, `/` in prod) — a key-by-key visualisation of the dax5 keyboard for verifying that every physical key produces the expected event. Read-only.

## Run

```bash
# From the repo root:
just editor

# Or directly:
cd tools/tester
pnpm install
pnpm dev        # editor at http://localhost:5173/
                # tester at http://localhost:5173/tester
```

Run from inside `tools/tester/` so the dev server's working directory resolves the repo root (`../..`).

## Editor flow

1. Open `/` in a browser. The page fetches `config/dax5.keymap` via `GET /api/keymap`, parses it, and renders the structured editor.
2. Switch tabs (Layers / Combos / Macros / Behaviors / Sensors / Mouse Gestures) and make changes. Each change is undoable (`⌘Z` / `⌘⇧Z`).
3. Press **Save…** to open the save dialog. The dialog calls `POST /api/keymap-preview` to render a unified diff against the on-disk file plus the lint result.
4. On **Confirm save** the editor calls `PUT /api/keymap` with `If-Match: <mtimeMs>`. The server uses an atomic write (tmp + rename) and produces a `.bak` snapshot on the first save per server-process lifetime.
5. If the file changed under you (mtime mismatch) the server returns 409 and the dialog tells you to reload.

After save, run `nix develop --command just build-target dax5_R` from the repo root to produce a firmware build. The editor does NOT trigger builds — keep that loop manual.

## Limitations

- dax5 only. The picker / matrix mapping are hard-coded for 44 keys (12 / 12 / 14 / 6, thumb row uses matrix cols c3..c8).
- Editor target file is `config/dax5.keymap`. No multi-keyboard support.
- The first save normalises whitespace in the `bindings = <…>;` blocks; subsequent edits round-trip cleanly (see `app/core/keymap-dt/serialize.ts` header for why). The `default_layer.grid.golden` fixture pins the canonical output.
- Section-body comments inside an edited section are dropped. Comments outside section bodies (root scope, preprocessor, unknown DT blocks) are preserved byte-for-byte.

## Tests

```bash
pnpm test
```

Tests cover the parser/writer (`app/core/keymap-dt/`, including a byte-exact serialize golden for `default_layer`), the picker / scoring / recent-keycodes (`app/core/picker/`), the editor reducer (`app/core/editor-state/`), the matrix mapping, the binding-dock subcomponents (`app/features/editor/shared/binding-dock/__tests__/`), the layer-boundary contract (`app/__tests__/boundaries.test.ts`), and the server endpoints (`app/routes/api/keymap.test.ts`).
