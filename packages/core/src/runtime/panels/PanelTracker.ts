/*
 * 让面板跟着三维对象走：每帧把对象顶部中心投影到屏幕，报告相对画布的像素坐标。
 * 相机在飞、用户在转视角时，面板都能贴着对象。
 */
import { Box3, type Object3D, Vector3 } from 'three'
import type { TwinEngine } from '../../engine/TwinEngine'

export interface PanelAnchor {
  x: number
  y: number
  /** 对象在相机后面时不显示。 */
  visible: boolean
}

export class PanelTracker {
  private readonly anchor = new Vector3()
  private readonly stopFrame: () => void
  private tracking = false

  constructor(
    private readonly engine: TwinEngine,
    private readonly onMove: (anchor: PanelAnchor) => void,
  ) {
    this.stopFrame = engine.onFrame(() => this.report())
  }

  track(object: Object3D | null): void {
    this.tracking = !!object
    if (!object) return
    const box = new Box3().setFromObject(object, true)
    if (box.isEmpty()) object.getWorldPosition(this.anchor)
    else box.getCenter(this.anchor).setY(box.max.y)
    this.report()
  }

  private report(): void {
    if (!this.tracking) return
    const { camera, canvas } = this.engine
    const point = this.anchor.clone().project(camera)
    this.onMove({
      x: ((point.x + 1) / 2) * canvas.clientWidth,
      y: ((1 - point.y) / 2) * canvas.clientHeight,
      visible: point.z < 1,
    })
  }

  dispose(): void {
    this.tracking = false
    this.stopFrame()
  }
}
