import { inject, type InjectionKey, type ShallowRef } from 'vue'
import type { EditorSession } from './EditorSession'

export const SessionKey: InjectionKey<ShallowRef<EditorSession | null>> = Symbol('editor-session')

/** 当前打开的会话。编辑器的面板要等会话创建后才渲染，所以这里不会是 null。 */
export function useSession(): EditorSession {
  const session = inject(SessionKey)?.value
  if (!session) throw new Error('useSession() called outside an open editor session')
  return session
}
