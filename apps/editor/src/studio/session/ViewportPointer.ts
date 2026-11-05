import { isLockedOrHidden } from '@twin-studio/core'
import type { EditorSession } from '../EditorSession'

/**
 * 三维视口里的鼠标（编辑模式）：单击选中，Shift / Ctrl 单击多选，双击聚焦，悬停描边，右键菜单；
 * 正在放置面板时，单击就是放一个。拖动超过 4 像素算旋转相机，不算点击。
 */
export class ViewportPointer {
  private pressed: { x: number; y: number; button: number } | null = null
  private hoverFrame: number | null = null

  constructor(private readonly session: EditorSession) {
    const canvas = session.canvas
    canvas.addEventListener('pointerdown', this.onPointerDown)
    canvas.addEventListener('pointermove', this.onPointerMove)
    canvas.addEventListener('pointerleave', this.onPointerLeave)
    window.addEventListener('pointerup', this.onPointerUp)
    canvas.addEventListener('dblclick', this.onDoubleClick)
    canvas.addEventListener('contextmenu', this.onContextMenu)
  }

  dispose(): void {
    const canvas = this.session.canvas
    if (this.hoverFrame !== null) cancelAnimationFrame(this.hoverFrame)
    canvas.removeEventListener('pointerdown', this.onPointerDown)
    canvas.removeEventListener('pointermove', this.onPointerMove)
    canvas.removeEventListener('pointerleave', this.onPointerLeave)
    window.removeEventListener('pointerup', this.onPointerUp)
    canvas.removeEventListener('dblclick', this.onDoubleClick)
    canvas.removeEventListener('contextmenu', this.onContextMenu)
  }

  private get editing(): boolean {
    return this.session.ui.mode === 'edit' && this.session.ui.ready
  }

  private readonly onPointerDown = (event: PointerEvent): void => {
    this.pressed = { x: event.clientX, y: event.clientY, button: event.button }
  }

  private readonly onPointerUp = (event: PointerEvent): void => {
    const start = this.pressed
    this.pressed = null
    if (!start || !this.editing) return
    if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > 4) return
    if (event.target !== this.session.canvas) return
    if (start.button === 2) return this.openContextMenu(event.clientX, event.clientY)
    if (start.button !== 0 || this.session.gizmo.active) return
    if (this.session.ui.placing) return void this.session.panels.placeAt(event.clientX, event.clientY)
    const additive = event.shiftKey || event.ctrlKey || event.metaKey
    const id = this.pickNode(event.clientX, event.clientY)
    if (!id) {
      if (!additive) this.session.clearSelection()
      return
    }
    this.session.select([id], additive ? 'toggle' : 'replace')
  }

  /** 右键单击（右键拖动是平移相机）：选中点到的东西并打开菜单。放置面板时右键结束放置。 */
  private openContextMenu(clientX: number, clientY: number): void {
    if (this.session.ui.placing) return this.session.panels.stopPlacing()
    const id = this.pickNode(clientX, clientY)
    if (!id) this.session.clearSelection()
    else if (!this.session.selection.value.includes(id)) this.session.select([id])
    const point = this.session.engine.pointAt(clientX, clientY)
    this.session.ui.contextMenu = { x: clientX, y: clientY, point: point ? [point.x, point.y, point.z] : null }
  }

  closeContextMenu(): void {
    this.session.ui.contextMenu = null
  }

  private readonly onContextMenu = (event: MouseEvent): void => {
    if (this.session.ui.mode === 'edit') event.preventDefault()
  }

  private readonly onDoubleClick = (event: MouseEvent): void => {
    if (!this.editing || this.session.ui.placing) return
    const id = this.pickNode(event.clientX, event.clientY)
    if (!id) return
    this.session.select([id])
    void this.session.focusSelection()
  }

  private readonly onPointerMove = (event: PointerEvent): void => {
    if (this.hoverFrame !== null) return
    const { clientX, clientY } = event
    this.hoverFrame = requestAnimationFrame(() => {
      this.hoverFrame = null
      if (this.session.disposed || !this.editing || this.pressed || this.session.gizmo.dragging) return
      this.setHovered(this.session.ui.placing ? null : this.pickNode(clientX, clientY))
    })
  }

  private readonly onPointerLeave = (): void => this.setHovered(null)

  setHovered(id: string | null): void {
    if (this.session.hovered.value === id) return
    this.session.hovered.value = id
    const object = id && !this.session.selection.value.includes(id) ? this.session.sync.objectFor(id) : null
    this.session.engine.setOutlined('hover', object ? [object] : [])
  }

  /** 鼠标下的节点；锁定的节点跳过。 */
  private pickNode(clientX: number, clientY: number): string | null {
    const hit = this.session.engine.pick(clientX, clientY)
    const id = hit ? this.session.sync.nodeIdOf(hit.object) : null
    return id && !isLockedOrHidden(this.session.doc.value, id).locked ? id : null
  }
}
