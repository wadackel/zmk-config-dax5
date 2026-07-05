import { useEditor } from '../../lib/editor-state/context'

export function BehaviorsTab() {
  const { state, dispatch } = useEditor()
  const behaviors = state.draft.behaviors
  const rootBehaviors = state.draft.rootBehaviors

  return (
    <div class="flex flex-col gap-6">
      <section>
        <h2 class="text-base font-mono mb-3">Custom behaviours ({behaviors.length})</h2>
        {behaviors.map((b, idx) => (
          <div key={idx} class="border border-zinc-800 rounded p-3 mb-3 flex flex-col gap-3">
            <div class="flex justify-between items-center">
              <input
                type="text"
                class="bg-[#1a1a1a] border border-zinc-700 rounded px-2 py-1 text-white text-sm font-mono"
                value={b.name}
                onInput={(e: Event) =>
                  dispatch({
                    type: 'UPDATE_BEHAVIOR',
                    index: idx,
                    behavior: { ...b, name: (e.target as HTMLInputElement).value },
                  })
                }
              />
              <span class="text-xs text-zinc-500 font-mono">{b.compatible}</span>
            </div>
            <div class="text-xs font-mono text-zinc-400">Properties</div>
            {b.props.map((p, pi) => (
              <div key={pi} class="flex gap-2 mb-1 text-xs">
                <input
                  type="text"
                  class="flex-1 bg-[#1a1a1a] border border-zinc-700 rounded px-2 py-1 text-white font-mono"
                  value={p.name}
                  onInput={(e: Event) =>
                    dispatch({
                      type: 'UPDATE_BEHAVIOR',
                      index: idx,
                      behavior: {
                        ...b,
                        props: b.props.map((q, i) =>
                          i === pi ? { ...q, name: (e.target as HTMLInputElement).value } : q,
                        ),
                      },
                    })
                  }
                />
                <input
                  type="text"
                  class="flex-1 bg-[#1a1a1a] border border-zinc-700 rounded px-2 py-1 text-white font-mono"
                  value={p.value}
                  onInput={(e: Event) =>
                    dispatch({
                      type: 'UPDATE_BEHAVIOR',
                      index: idx,
                      behavior: {
                        ...b,
                        props: b.props.map((q, i) =>
                          i === pi ? { ...q, value: (e.target as HTMLInputElement).value } : q,
                        ),
                      },
                    })
                  }
                />
              </div>
            ))}
          </div>
        ))}
      </section>

      <section>
        <h2 class="text-base font-mono mb-3">Global behaviour configs (&amp;mt / &amp;lt)</h2>
        {rootBehaviors.map((rb, idx) => (
          <div key={idx} class="border border-zinc-800 rounded p-3 mb-3 flex flex-col gap-2">
            <div class="text-xs font-mono text-zinc-400">&amp;{rb.kind}</div>
            {rb.props.map((p, pi) => (
              <div key={pi} class="flex gap-2 mb-1 text-xs">
                <input
                  type="text"
                  class="flex-1 bg-[#1a1a1a] border border-zinc-700 rounded px-2 py-1 text-white font-mono"
                  value={p.name}
                  onInput={(e: Event) =>
                    dispatch({
                      type: 'UPDATE_ROOT_BEHAVIOR',
                      index: idx,
                      cfg: {
                        ...rb,
                        props: rb.props.map((q, i) =>
                          i === pi ? { ...q, name: (e.target as HTMLInputElement).value } : q,
                        ),
                      },
                    })
                  }
                />
                <input
                  type="text"
                  class="flex-1 bg-[#1a1a1a] border border-zinc-700 rounded px-2 py-1 text-white font-mono"
                  value={p.value}
                  onInput={(e: Event) =>
                    dispatch({
                      type: 'UPDATE_ROOT_BEHAVIOR',
                      index: idx,
                      cfg: {
                        ...rb,
                        props: rb.props.map((q, i) =>
                          i === pi ? { ...q, value: (e.target as HTMLInputElement).value } : q,
                        ),
                      },
                    })
                  }
                />
              </div>
            ))}
          </div>
        ))}
      </section>
    </div>
  )
}
