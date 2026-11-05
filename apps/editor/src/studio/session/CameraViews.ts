import { type CameraBookmark, newId } from '@twin-studio/core'
import type { EditorSession } from '../EditorSession'

const THUMBNAIL_WIDTH = 240

/** 镜头：把当前视角存下来，点击卡片切回去。 */
export class CameraViews {
  constructor(private readonly session: EditorSession) {}

  private currentView(): CameraBookmark['view'] {
    const { rig, camera, canvas } = this.session.engine
    return { ...rig.getView(), aspect: canvas.clientWidth / Math.max(1, canvas.clientHeight), fov: camera.fov }
  }

  async add(): Promise<void> {
    const { session } = this
    const view = this.currentView()
    const thumbnail = (await session.captureFrom(view, THUMBNAIL_WIDTH)) ?? undefined
    const id = newId('bookmark')
    session.edit('添加镜头', draft => {
      draft.bookmarks.push({ id, name: `镜头 ${draft.bookmarks.length + 1}`, view, thumbnail })
    })
  }

  /** 用当前视角替换这个镜头。 */
  async update(id: string): Promise<void> {
    const { session } = this
    const view = this.currentView()
    const thumbnail = (await session.captureFrom(view, THUMBNAIL_WIDTH)) ?? undefined
    session.edit('更新镜头', draft => {
      const bookmark = draft.bookmarks.find(item => item.id === id)
      if (!bookmark) return
      bookmark.view = view
      bookmark.thumbnail = thumbnail
    })
  }

  rename(id: string, name: string): void {
    const text = name.trim()
    if (!text) return
    this.session.edit('重命名镜头', draft => {
      const bookmark = draft.bookmarks.find(item => item.id === id)
      if (bookmark) bookmark.name = text
    })
  }

  remove(id: string): void {
    this.session.edit('删除镜头', draft => {
      draft.bookmarks = draft.bookmarks.filter(item => item.id !== id)
    })
  }

  flyTo(id: string): void {
    const bookmark = this.session.doc.value.bookmarks.find(item => item.id === id)
    if (bookmark) void this.session.engine.flyTo(bookmark.view)
  }
}
