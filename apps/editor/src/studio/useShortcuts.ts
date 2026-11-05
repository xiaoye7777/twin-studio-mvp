import { onBeforeUnmount, onMounted, type ShallowRef } from 'vue'
import type { EditorSession } from './EditorSession'

function typing(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
}

/** 编辑器的快捷键。 */
export function useStudioShortcuts(session: ShallowRef<EditorSession | null>, onSave: () => void): void {
  const onKeyDown = (event: KeyboardEvent) => {
    const s = session.value
    if (!s?.ui.ready || typing(event.target)) return
    const mod = event.ctrlKey || event.metaKey
    const key = event.key.toLowerCase()
    const run = (action: () => void) => {
      event.preventDefault()
      action()
    }
    if (s.ui.mode === 'preview') {
      if (key === 'escape') run(() => s.exitPreview())
      return
    }
    if (mod && key === 's') return run(onSave)
    if (mod && key === 'z') return run(() => (event.shiftKey ? s.redo() : s.undo()))
    if (mod && key === 'y') return run(() => s.redo())
    if (mod && key === 'd') return run(() => s.nodes.duplicateSelection())
    if (mod && key === 'a') return run(() => s.selectAll())
    if (mod) return
    if (key === 'delete' || key === 'backspace') return run(() => s.nodes.removeSelection())
    if (key === 'escape') return run(() => s.clearSelection())
    if (key === 'f') return run(() => void s.focusSelection())
    if (key === 'w') return run(() => s.setTool('translate'))
    if (key === 'e') return run(() => s.setTool('rotate'))
    if (key === 'r') return run(() => s.setTool('scale'))
  }
  onMounted(() => window.addEventListener('keydown', onKeyDown))
  onBeforeUnmount(() => window.removeEventListener('keydown', onKeyDown))
}
