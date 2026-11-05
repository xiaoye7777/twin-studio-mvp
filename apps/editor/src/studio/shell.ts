import { inject, type InjectionKey, reactive } from 'vue'

/** 编辑器窗口的界面状态（不属于场景文档）。 */
export function createShellState() {
  return reactive({
    leftTab: 'scene' as 'scene' | 'cameras' | 'panels',
    /** 右栏正在编辑的面板模板；选中节点时右栏显示节点属性。 */
    templateId: null as string | null,
  })
}

export type ShellState = ReturnType<typeof createShellState>
export const ShellKey: InjectionKey<ShellState> = Symbol('studio-shell')

export function useShell(): ShellState {
  const shell = inject(ShellKey)
  if (!shell) throw new Error('useShell() called outside the studio')
  return shell
}
