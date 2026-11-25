import { inject, type InjectionKey, type ShallowRef } from 'vue'
import type { EditorSession } from './EditorSession'

export const SessionKey: InjectionKey<ShallowRef<EditorSession | null>> = Symbol('editor-session')

/** 当前打开的场景。编辑器的面板都在场景打开后才渲染，所以这里不会是空的。 */
export function useSession(): EditorSession {
  const session = inject(SessionKey)?.value
  if (!session) throw new Error('useSession() called outside an open editor session')
  return session
}

/** 场景树、右栏共用的节点类型名称。 */
export const nodeKindLabels: Record<string, string> = {
  model: '模型',
  group: '分组',
  primitive: '基本体',
  path: '路径',
  area: '区域',
  label: '标注',
  light: '灯光',
  'panel-group': '标签组',
  panel: '信息面板',
}
