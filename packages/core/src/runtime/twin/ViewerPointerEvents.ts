import { Vector2, type Intersection, type Object3D } from 'three'
import { twinBindingTargetKey } from '../../domain/twin'
import type { ViewerClickHit } from '../../contract/viewerContract'

import { bindingTargetFromObject } from './BindingTargetResolver'
import type { TwinRuntimeState } from './TwinDataRuntime'

/** The picking the pointer dispatcher needs (TwinEngine provides it). */
export interface PointerPickHost {
  raycastObjects(ndc: Vector2): Intersection<Object3D>[]
}

const DOUBLE_CLICK_MS = 260

/** One pointer dispatcher for selection and configured interaction triggers. */
export class ViewerPointerEvents {
  private start: { id: number; x: number; y: number; moved: boolean } | null = null
  private readonly pointers = new Set<number>()
  private pending: {
    hit: ViewerClickHit
    key: string
    time: number
    timer: ReturnType<typeof setTimeout>
  } | null = null
  private hover: ViewerClickHit | null = null
  private hoverFrame: number | null = null
  private hoverPoint = { x: 0, y: 0 }
  private disposed = false
  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly runtime: PointerPickHost,
    private readonly roots: readonly Object3D[] | (() => readonly Object3D[]),
    private readonly twin: TwinRuntimeState,
    private readonly onClick: (event: ViewerClickHit) => void,
    private readonly onBlank: () => void = () => {},
    private readonly onDoubleClick: (event: ViewerClickHit) => void = () => {},
    private readonly onHoverEnter: (event: ViewerClickHit) => void = () => {},
    private readonly onHoverLeave?: (event: ViewerClickHit) => void,
    private readonly hasDoubleClick?: (hit: ViewerClickHit) => boolean,
  ) {
    canvas.addEventListener('pointerdown', this.down)
    canvas.addEventListener('pointermove', this.hoverMove)
    canvas.addEventListener('pointerleave', this.leave)
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
    if (
      !start ||
      start.id !== event.pointerId ||
      start.moved ||
      Math.hypot(event.clientX - start.x, event.clientY - start.y) > 5
    )
      return
    const hit = this.resolve(event.clientX, event.clientY)
    if (!hit || !this.hasDoubleClick?.(hit)) {
      this.flushPending()
      if (hit) this.onClick(hit)
      else this.onBlank()
      return
    }
    const key = twinBindingTargetKey(hit.target)
    const now = Date.now()
    if (this.pending && this.pending.key === key && now - this.pending.time <= DOUBLE_CLICK_MS) {
      clearTimeout(this.pending.timer)
      this.pending = null
      this.onDoubleClick(hit)
      return
    }
    if (this.pending) this.flushPending()
    const timer = setTimeout(() => this.flushPending(), DOUBLE_CLICK_MS)
    this.pending = { hit, key, time: now, timer }
  }
  private flushPending(): void {
    const pending = this.pending
    if (!pending || this.disposed) return
    clearTimeout(pending.timer)
    this.pending = null
    this.onClick(pending.hit)
  }
  private readonly hoverMove = (event: PointerEvent): void => {
    if (this.pointers.size || !this.onHoverLeave) return
    this.hoverPoint = { x: event.clientX, y: event.clientY }
    if (this.hoverFrame !== null) return
    this.hoverFrame = requestAnimationFrame(() => {
      this.hoverFrame = null
      const next = this.resolve(this.hoverPoint.x, this.hoverPoint.y)
      const beforeKey = this.hover ? twinBindingTargetKey(this.hover.target) : ''
      const nextKey = next ? twinBindingTargetKey(next.target) : ''
      if (beforeKey === nextKey) return
      if (this.hover) this.onHoverLeave?.(this.hover)
      this.hover = next
      if (next) this.onHoverEnter(next)
    })
  }
  private readonly leave = (): void => {
    if (this.hoverFrame !== null) {
      cancelAnimationFrame(this.hoverFrame)
      this.hoverFrame = null
    }
    if (this.hover) this.onHoverLeave?.(this.hover)
    this.hover = null
  }
  private resolve(clientX: number, clientY: number): ViewerClickHit | null {
    const roots = typeof this.roots === 'function' ? this.roots() : this.roots
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
    this.canvas.removeEventListener('pointermove', this.hoverMove)
    this.canvas.removeEventListener('pointerleave', this.leave)
    window.removeEventListener('pointermove', this.move)
    window.removeEventListener('pointerup', this.up)
    window.removeEventListener('pointercancel', this.cancel)
    if (this.pending) clearTimeout(this.pending.timer)
    if (this.hoverFrame !== null) cancelAnimationFrame(this.hoverFrame)
    this.pending = null
    this.hoverFrame = null
    this.hover = null
    this.start = null
    this.pointers.clear()
  }
}
