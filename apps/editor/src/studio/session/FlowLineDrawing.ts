import { BufferAttribute, BufferGeometry, Group, Points, PointsMaterial, Vector3 } from 'three'
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js'
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js'
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js'
import { identityTransform, newId, uniqueName } from '@twin-studio/core'
import type { EditorSession } from '../EditorSession'

// Matches the scene format's maximum path length, with one extra slot for the cursor.
const MAX_POINTS = 500

export class FlowLineDrawing {
  readonly preview = new Group()
  private readonly points: Vector3[] = []
  private readonly positions = new BufferAttribute(new Float32Array((MAX_POINTS + 1) * 3), 3)
  private readonly geometry = new BufferGeometry()
  private readonly segments = new LineSegmentsGeometry().setPositions(new Float32Array(MAX_POINTS * 6))
  // The ground and grid render in the transparent pass. Draw the guides after them without touching depth.
  private readonly stroke = new LineMaterial({
    color: '#38d6ff',
    linewidth: 3,
    transparent: true,
    depthTest: false,
    depthWrite: false,
  })
  private readonly dots = new PointsMaterial({
    color: '#38d6ff',
    size: 6,
    sizeAttenuation: false,
    transparent: true,
    depthTest: false,
    depthWrite: false,
  })

  constructor(private readonly session: EditorSession) {
    this.geometry.setAttribute('position', this.positions)
    this.geometry.setDrawRange(0, 0)
    this.segments.instanceCount = 0
    this.preview.renderOrder = 20
    const line = new LineSegments2(this.segments, this.stroke)
    const vertices = new Points(this.geometry, this.dots)
    for (const object of [line, vertices]) {
      object.frustumCulled = false
      object.renderOrder = 20
      this.preview.add(object)
    }
    this.preview.visible = false
    session.engine.overlay.add(this.preview)
  }

  private setVertex(index: number, point: Vector3): void {
    this.positions.setXYZ(index, point.x, point.y, point.z)
    this.positions.needsUpdate = true
    if (index === 0) return
    const previous = this.points[index - 1]!
    const { instanceStart, instanceEnd } = this.segments.attributes
    instanceStart!.setXYZ(index - 1, previous.x, previous.y, previous.z)
    instanceEnd!.setXYZ(index - 1, point.x, point.y, point.z)
    // The start and end attributes share one interleaved GPU buffer.
    instanceEnd!.needsUpdate = true
  }

  /** Show the last segment up to the pointer without adding it to the document. */
  showCursor(point: Vector3 | null): void {
    const count = this.points.length
    if (point) this.setVertex(count, point)
    const visible = count + (point ? 1 : 0)
    this.geometry.setDrawRange(0, visible)
    this.segments.instanceCount = Math.max(0, visible - 1)
  }

  addPoint(point: Vector3 | null): void {
    if (!point || this.points.at(-1)?.distanceToSquared(point) === 0) return
    this.setVertex(this.points.length, point)
    this.points.push(point)
    this.session.ui.flowPoints = this.points.length
    this.showCursor(null)
    if (this.points.length === MAX_POINTS) this.finish()
  }

  undoPoint(): void {
    this.points.pop()
    this.session.ui.flowPoints = this.points.length
    this.showCursor(null)
  }

  finish(): void {
    if (this.points.length < 2) return
    const origin = this.points[0]!
    const local = this.points.map(point => point.clone().sub(origin).toArray())
    const id = newId('node')
    this.session.edit('绘制能流线', draft => {
      draft.nodes.push({
        id,
        parentId: null,
        name: uniqueName(draft, '能流线'),
        kind: 'path',
        visible: true,
        locked: false,
        transform: { ...identityTransform(), position: origin.toArray() },
        path: { points: local, style: 'flow', closed: false, color: '#38d6ff', width: 0.6, speed: 1.5, opacity: 0.95 },
      })
    })
    this.session.setTool('select')
    this.session.select([id])
  }

  reset(): void {
    this.points.length = 0
    this.session.ui.flowPoints = 0
    this.showCursor(null)
    this.preview.visible = false
  }

  dispose(): void {
    this.preview.removeFromParent()
    this.geometry.dispose()
    this.segments.dispose()
    this.stroke.dispose()
    this.dots.dispose()
  }
}
