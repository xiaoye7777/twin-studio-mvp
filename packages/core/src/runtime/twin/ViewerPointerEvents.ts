/*
 * 视口里的点击：点到对象就报告对象和它绑定的设备，点到空白就报告空白。
 * 拖动视角、多指操作都不算点击。编辑器的预览模式和 Viewer 共用它。
 */
import { Vector2 } from 'three'
import type { Intersection, Object3D } from 'three'
import type { ViewerClickHit } from '../../contract/viewerContract'
import { bindingTargetFromObject } from './BindingTargetResolver'
import type { TwinRuntimeState } from './TwinDataRuntime'

/** 拾取能力（TwinEngine 提供）。 */
export interface PointerPickHost {
  raycastObjects(ndc: Vector2): Intersection<Object3D>[]
}

export class ViewerPointerEvents {
  private start: { id: number; x: number; y: number; moved: boolean } | null = null
  private readonly pointers = new Set<number>()
  private disposed = false

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly runtime: PointerPickHost,
    private readonly roots: () => readonly Object3D[],
    private readonly twin: TwinRuntimeState,
    private readonly onClick: (hit: ViewerClickHit) => void,
    private readonly onBlank: () => void = () => {},
  ) {
    canvas.addEventListener('pointerdown', this.down)
    window.addEventListener('pointermove', this.move)
    window.addEventListener('pointerup', this.up)
    window.addEventListener('pointercancel', this.cancel)
  }

  private readonly down = (event: PointerEvent): void => {
    this.pointers.add(event.pointerId)
    if (this.pointers.size > 1) {
      this.start = null
      return
    }
    if (event.button === 0) this.start = { id: event.pointerId, x: event.clientX, y: event.clientY, moved: false }
  }

  private readonly move = (event: PointerEvent): void => {
    if (
      this.start?.id === event.pointerId &&
      Math.hypot(event.clientX - this.start.x, event.clientY - this.start.y) > 5
    )
      this.start.moved = true
  }

  private readonly cancel = (event: PointerEvent): void => {
    this.pointers.delete(event.pointerId)
    if (this.start?.id === event.pointerId) this.start = null
  }

  private readonly up = (event: PointerEvent): void => {
    const start = this.start
    this.cancel(event)
    if (!start || start.id !== event.pointerId || start.moved) return
    const hit = this.resolve(event.clientX, event.clientY)
    if (hit) this.onClick(hit)
    else this.onBlank()
  }

  private resolve(clientX: number, clientY: number): ViewerClickHit | null {
    const roots = this.roots()
    const rect = this.canvas.getBoundingClientRect()
    if (
      !rect.width ||
      !rect.height ||
      clientX < rect.left ||
      clientX > rect.right ||
      clientY < rect.top ||
      clientY > rect.bottom
    )
      return null
    const hits = this.runtime.raycastObjects(
      new Vector2(((clientX - rect.left) / rect.width) * 2 - 1, 1 - ((clientY - rect.top) / rect.height) * 2),
    )
    for (const hit of hits) {
      const chain: Object3D[] = []
      let node: Object3D | null = hit.object
      while (node) {
        chain.push(node)
        if (roots.includes(node)) break
        node = node.parent
      }
      if (!node || chain.some(item => !item.visible)) continue
      // 点到模型内部的网格也算点到这个模型；设备可能绑在它自己或外层分组上。
      const owner = chain.find(item => typeof item.userData.sceneNodeId === 'string')
      const target = owner ? bindingTargetFromObject(owner) : null
      if (!target) continue
      const binding = chain
        .map(bindingTargetFromObject)
        .map(item => (item ? this.twin.getBindingByTarget(item) : null))
        .find(item => item !== null)
      return { target, bindingTarget: binding?.target, device: binding?.device, bindingId: binding?.id }
    }
    return null
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.canvas.removeEventListener('pointerdown', this.down)
    window.removeEventListener('pointermove', this.move)
    window.removeEventListener('pointerup', this.up)
    window.removeEventListener('pointercancel', this.cancel)
    this.start = null
    this.pointers.clear()
  }
}
