import { inject, type InjectionKey, reactive } from 'vue'

/** 编辑器窗口的界面状态（不属于场景文档）。 */
export function createShellState() {
  return reactive({
    leftTab: 'scene' as 'scene' | 'cameras',
    /** 选中对象时右栏的页签。 */
    nodeTab: 'properties' as 'properties' | 'data',
    /** 什么都没选时右栏的页签。 */
    sceneTab: 'environment' as 'environment' | 'data',
    dialog: null as 'batch-bind' | null,
    /** 场景树里正在改名的节点。 */
    renaming: null as string | null,
  })
}

export type ShellState = ReturnType<typeof createShellState>
export const ShellKey: InjectionKey<ShellState> = Symbol('studio-shell')

export function useShell(): ShellState {
  const shell = inject(ShellKey)
  if (!shell) throw new Error('useShell() called outside the studio')
  return shell
}
