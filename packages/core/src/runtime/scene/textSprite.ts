import {
  CanvasTexture,
  LinearFilter,
  type Object3D,
  type PerspectiveCamera,
  SRGBColorSpace,
  Sprite,
  SpriteMaterial,
  Vector3,
} from 'three'

export type TextSpriteStyle = 'tag' | 'title' | 'pin' | 'panel'

export interface TextSpriteContent {
  /** First line is the title; later lines are rows (a "label: value" row is split on the first "\t"). */
  lines: string[]
  style: TextSpriteStyle
  color: string
  background: string
  /** Size multiplier; 1 is roughly 4% of the viewport height per line. */
  size: number
  opacity?: number
}

/** Every live label, for the per-frame collision layout. */
const textSprites = new Set<TextSprite>()

const FONT = '"PingFang SC","Microsoft YaHei","Noto Sans SC",system-ui,sans-serif'
const SCALE = 2

function rgba(hex: string, alpha: number): string {
  const value = Number.parseInt(hex.slice(1), 16)
  return `rgba(${(value >> 16) & 255},${(value >> 8) & 255},${value & 255},${alpha})`
}

function roundRect(context: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  context.beginPath()
  context.moveTo(x + r, y)
  context.arcTo(x + w, y, x + w, y + h, r)
  context.arcTo(x + w, y + h, x, y + h, r)
  context.arcTo(x, y + h, x, y, r)
  context.arcTo(x, y, x + w, y, r)
  context.closePath()
}

/**
 * A camera-facing label drawn on a canvas. Its on-screen size is a fixed fraction of the viewport height,
 * so text stays legible on a laptop and on a cinema wall alike.
 */
export class TextSprite extends Sprite {
  private readonly canvas = document.createElement('canvas')
  private texture: CanvasTexture | null = null
  private signature = ''
  private aspect = 1
  /** Higher keeps its place when labels collide (see layoutLabels). */
  priority = 1
  /** The content's own opacity; the layout fades it in and out on top. */
  private baseOpacity = 1
  /** 0–1 visibility decided by the layout, eased per frame. */
  layoutAlpha = 1

  constructor(content?: TextSpriteContent, priority = 1) {
    super(new SpriteMaterial({ transparent: true, depthWrite: false, sizeAttenuation: false }))
    this.priority = priority
    textSprites.add(this)
    // Invisible until it has content: a screen-sized sprite would otherwise flash over the scene.
    this.scale.set(0, 0, 1)
    this.renderOrder = 10
    this.userData.editorInternal = true
    this.raycast = () => {}
    if (content) this.setContent(content)
  }

  /** Redraws only when the content changed. */
  setContent(content: TextSpriteContent): void {
    const signature = JSON.stringify(content)
    if (signature === this.signature) return
    this.signature = signature
    const context = this.canvas.getContext('2d')
    if (!context) return
    const { lines, style, color, background } = content
    const title = lines[0] ?? ''
    const rows = lines.slice(1)
    const titleSize = (style === 'title' ? 40 : 28) * SCALE
    const rowSize = 24 * SCALE
    const pad = (style === 'title' ? 18 : 14) * SCALE
    context.font = `600 ${titleSize}px ${FONT}`
    let width = context.measureText(title).width
    context.font = `500 ${rowSize}px ${FONT}`
    for (const row of rows) {
      const [label, value = ''] = row.split('\t')
      width = Math.max(width, context.measureText(`${label}${value}`).width + 36 * SCALE)
    }
    const pin = style === 'pin' ? 22 * SCALE : 0
    const rowGap = 10 * SCALE
    const contentHeight = titleSize + rows.length * (rowSize + rowGap)
    const w = Math.ceil(width + pad * 2 + (style === 'tag' || style === 'panel' ? 8 * SCALE : 0))
    const h = Math.ceil(contentHeight + pad * 2 + pin)
    const resized = this.canvas.width !== w || this.canvas.height !== h
    this.canvas.width = w
    this.canvas.height = h
    context.clearRect(0, 0, w, h)
    const boxHeight = h - pin
    if (style !== 'title') {
      roundRect(context, 1, 1, w - 2, boxHeight - 2, 10 * SCALE)
      context.fillStyle = rgba(background, 0.82)
      context.fill()
      context.lineWidth = 2 * SCALE
      context.strokeStyle = rgba(color, 0.9)
      context.stroke()
      if (style === 'tag' || style === 'panel') {
        context.fillStyle = color
        context.fillRect(1, 10 * SCALE, 6 * SCALE, boxHeight - 20 * SCALE)
      }
      if (pin) {
        context.beginPath()
        context.moveTo(w / 2 - pin * 0.7, boxHeight - 2)
        context.lineTo(w / 2, h)
        context.lineTo(w / 2 + pin * 0.7, boxHeight - 2)
        context.closePath()
        context.fillStyle = color
        context.fill()
      }
    }
    context.textBaseline = 'top'
    context.font = `600 ${titleSize}px ${FONT}`
    context.fillStyle = style === 'title' ? color : '#ffffff'
    if (style === 'title') {
      context.shadowColor = 'rgba(0,0,0,0.65)'
      context.shadowBlur = 8 * SCALE
    }
    context.textAlign = rows.length ? 'left' : 'center'
    context.fillText(title, rows.length ? pad + 6 * SCALE : w / 2, pad)
    context.shadowBlur = 0
    let y = pad + titleSize + rowGap
    context.font = `500 ${rowSize}px ${FONT}`
    for (const row of rows) {
      const [label, value] = row.split('\t')
      context.textAlign = 'left'
      context.fillStyle = 'rgba(220,226,234,0.75)'
      context.fillText(label ?? '', pad + 6 * SCALE, y)
      if (value !== undefined) {
        context.textAlign = 'right'
        context.fillStyle = color
        context.fillText(value, w - pad, y)
      }
      y += rowSize + rowGap
    }
    // GPU texture storage has a fixed size: a canvas that changed size needs a new texture.
    if (resized || !this.texture) {
      this.texture?.dispose()
      this.texture = new CanvasTexture(this.canvas)
      this.texture.colorSpace = SRGBColorSpace
      this.texture.minFilter = LinearFilter
      this.texture.generateMipmaps = false
      this.material.map = this.texture
      this.material.needsUpdate = true
    } else this.texture.needsUpdate = true
    this.aspect = w / h
    const lineHeight = 0.045 * content.size
    const height = (h / (titleSize + pad * 2)) * lineHeight
    this.scale.set(height * this.aspect, height, 1)
    this.center.set(0.5, 0)
    this.baseOpacity = content.opacity ?? 1
    this.material.opacity = this.baseOpacity * this.layoutAlpha
  }

  /** Applies the layout's decision: an upward slot offset and a fade target. */
  applyLayout(slot: number, visible: boolean, delta: number): void {
    this.center.y = -slot * 1.12
    const target = visible ? 1 : 0
    this.layoutAlpha += (target - this.layoutAlpha) * Math.min(1, delta * 10)
    if (Math.abs(target - this.layoutAlpha) < 0.01) this.layoutAlpha = target
    this.material.opacity = this.baseOpacity * this.layoutAlpha
  }

  dispose(): void {
    textSprites.delete(this)
    this.texture?.dispose()
    this.material.dispose()
  }
}

interface Placed {
  left: number
  right: number
  top: number
  bottom: number
}

const projected = new Vector3()
const worldPosition = new Vector3()

function inside(sprite: Object3D, root: Object3D): { visible: boolean; attached: boolean } {
  let visible = true
  for (let node: Object3D | null = sprite; node; node = node.parent) {
    if (!node.visible) visible = false
    if (node === root) return { visible, attached: true }
  }
  return { visible: false, attached: false }
}

/**
 * Keeps labels readable when they crowd: each frame, labels are placed in priority order (then nearest
 * first); a label that would overlap one already placed moves up one or two slots, and if there is still
 * no room it fades out until space frees up. Works in screen space, so it adapts to any screen size.
 */
export function layoutLabels(
  root: Object3D,
  camera: PerspectiveCamera,
  width: number,
  height: number,
  delta: number,
): void {
  const entries: Array<{ sprite: TextSprite; rect: Placed; distance: number }> = []
  const xScale = (camera.projectionMatrix.elements[0]! * width) / 2
  const yScale = (camera.projectionMatrix.elements[5]! * height) / 2
  for (const sprite of textSprites) {
    const { visible, attached } = inside(sprite, root)
    if (!attached) continue
    if (!visible || sprite.scale.y === 0) {
      sprite.applyLayout(0, false, 1)
      continue
    }
    sprite.getWorldPosition(worldPosition)
    projected.copy(worldPosition).project(camera)
    if (projected.z > 1 || projected.z < -1) {
      sprite.applyLayout(0, false, delta)
      continue
    }
    const x = ((projected.x + 1) / 2) * width
    const y = ((1 - projected.y) / 2) * height
    const w = sprite.scale.x * xScale
    const h = sprite.scale.y * yScale
    entries.push({
      sprite,
      rect: { left: x - w / 2, right: x + w / 2, top: y - h, bottom: y },
      distance: worldPosition.distanceTo(camera.position),
    })
  }
  entries.sort((a, b) => b.sprite.priority - a.sprite.priority || a.distance - b.distance)
  const placed: Placed[] = []
  const gap = 3
  const overlaps = (rect: Placed) =>
    placed.some(
      other =>
        rect.left < other.right + gap &&
        rect.right > other.left - gap &&
        rect.top < other.bottom + gap &&
        rect.bottom > other.top - gap,
    )
  for (const { sprite, rect } of entries) {
    const h = rect.bottom - rect.top
    let slot = -1
    for (let candidate = 0; candidate < 3; candidate++) {
      const shifted = { ...rect, top: rect.top - candidate * h * 1.12, bottom: rect.bottom - candidate * h * 1.12 }
      if (!overlaps(shifted)) {
        placed.push(shifted)
        slot = candidate
        break
      }
    }
    sprite.applyLayout(Math.max(0, slot), slot >= 0, delta)
  }
}
