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
      if (key === 'escape' || key === 'p') run(() => s.exitPreview())
      return
    }
    if (s.ui.placing && key === 'escape') return run(() => s.panels.stopPlacing())
    if (mod && key === 's') return run(onSave)
    if (mod && key === 'z') return run(() => (event.shiftKey ? s.redo() : s.undo()))
    if (mod && key === 'y') return run(() => s.redo())
    if (mod && key === 'd') return run(() => s.nodes.duplicateSelection())
    if (mod && key === 'c') return run(() => s.nodes.copySelection())
    if (mod && key === 'v') return run(() => s.nodes.paste())
    if (mod && key === 'a') return run(() => s.selectAll())
    if (mod && key === 'g') return run(() => (event.shiftKey ? s.nodes.ungroupSelection() : s.nodes.groupSelection()))
    if (mod) return
    switch (key) {
      case 'q':
        return run(() => s.setTool('select'))
      case 'w':
        return run(() => s.setTool('translate'))
      case 'e':
        return run(() => s.setTool('rotate'))
      case 'r':
        return run(() => s.setTool('scale'))
      case 'f':
        return run(() => void s.focusSelection())
      case 'h':
        return run(() => s.nodes.toggleVisibilityOfSelection())
      case 'delete':
      case 'backspace':
        return run(() => s.nodes.deleteSelection())
      case 'escape':
        return run(() => s.clearSelection())
      case 'end':
        return run(() => s.nodes.dropToGround())
      case 'p':
        return run(() => s.enterPreview())
      case '7':
        return run(() => void s.viewFrom('top'))
      case '1':
        return run(() => void s.viewFrom('front'))
      case '3':
        return run(() => void s.viewFrom('right'))
      case '0':
        return run(() => void s.viewFrom('perspective'))
    }
  }
  onMounted(() => window.addEventListener('keydown', onKeyDown))
  onBeforeUnmount(() => window.removeEventListener('keydown', onKeyDown))
}
