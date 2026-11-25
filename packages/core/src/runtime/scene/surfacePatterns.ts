import { CanvasTexture, RepeatWrapping, SRGBColorSpace, type Texture } from 'three'

export interface SurfacePattern {
  kind: string
  /** Metres per repeat. */
  scale: number
  color: string
}

/** Patterns this version draws; other kinds (from newer files) render as a plain surface. */
export const surfacePatternKinds = ['grid', 'tiles', 'stripes', 'lawn', 'asphalt', 'water'] as const

const SIZE = 256
const sources = new Map<string, { map: CanvasTexture; glow: CanvasTexture | null }>()

/** Small seeded generator, so a pattern looks the same every time it is drawn. */
function random(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function canvas(): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const element = document.createElement('canvas')
  element.width = element.height = SIZE
  return [element, element.getContext('2d')!]
}

/** A dot drawn on every side it crosses, so the tile repeats without seams. */
function wrappedDot(context: CanvasRenderingContext2D, x: number, y: number, radius: number): void {
  for (const dx of [-SIZE, 0, SIZE])
    for (const dy of [-SIZE, 0, SIZE]) {
      const cx = x + dx
      const cy = y + dy
      if (cx < -radius || cx > SIZE + radius || cy < -radius || cy > SIZE + radius) continue
      context.beginPath()
      context.arc(cx, cy, radius, 0, Math.PI * 2)
      context.fill()
    }
}

function speckle(
  context: CanvasRenderingContext2D,
  count: number,
  seed: number,
  size: [number, number],
  alpha: number,
): void {
  const next = random(seed)
  for (let i = 0; i < count; i++) {
    const light = next() > 0.5
    context.fillStyle = light ? `rgba(255,255,255,${alpha * next()})` : `rgba(0,0,0,${alpha * next()})`
    wrappedDot(context, next() * SIZE, next() * SIZE, size[0] + next() * (size[1] - size[0]))
  }
}

function lines(context: CanvasRenderingContext2D, color: string, minorAlpha: number): void {
  context.strokeStyle = color
  context.globalAlpha = minorAlpha
  context.lineWidth = 1
  for (let i = 1; i < 4; i++) {
    const at = (SIZE / 4) * i + 0.5
    context.beginPath()
    context.moveTo(at, 0)
    context.lineTo(at, SIZE)
    context.moveTo(0, at)
    context.lineTo(SIZE, at)
    context.stroke()
  }
  context.globalAlpha = 1
  context.lineWidth = 3
  context.strokeRect(0, 0, SIZE, SIZE)
}

/** Draws one repeat of a pattern; null for kinds this version does not know. */
function draw(
  kind: string,
  base: string,
  accent: string,
): { map: HTMLCanvasElement; glow: HTMLCanvasElement | null } | null {
  const [map, context] = canvas()
  context.fillStyle = base
  context.fillRect(0, 0, SIZE, SIZE)
  switch (kind) {
    case 'grid': {
      lines(context, accent, 0.35)
      const [glow, glowContext] = canvas()
      glowContext.fillStyle = '#000'
      glowContext.fillRect(0, 0, SIZE, SIZE)
      lines(glowContext, '#fff', 0.3)
      return { map, glow }
    }
    case 'tiles': {
      const next = random(7)
      const half = SIZE / 2
      for (const x of [0, half])
        for (const y of [0, half]) {
          context.fillStyle = next() > 0.5 ? `rgba(255,255,255,${0.06 * next()})` : `rgba(0,0,0,${0.08 * next()})`
          context.fillRect(x, y, half, half)
        }
      speckle(context, 900, 11, [0.4, 1], 0.12)
      context.strokeStyle = accent
      context.lineWidth = 4
      context.strokeRect(0, 0, SIZE, SIZE)
      context.beginPath()
      context.moveTo(half, 0)
      context.lineTo(half, SIZE)
      context.moveTo(0, half)
      context.lineTo(SIZE, half)
      context.lineWidth = 3
      context.stroke()
      return { map, glow: null }
    }
    case 'stripes': {
      context.fillStyle = accent
      const period = SIZE / 4
      for (let k = -4; k < 8; k++) {
        context.beginPath()
        context.moveTo(k * period, 0)
        context.lineTo(k * period + period / 2, 0)
        context.lineTo(k * period + period / 2 - SIZE, SIZE)
        context.lineTo(k * period - SIZE, SIZE)
        context.closePath()
        context.fill()
      }
      return { map, glow: null }
    }
    case 'lawn': {
      speckle(context, 2600, 3, [0.6, 1.6], 0.22)
      context.fillStyle = accent
      context.globalAlpha = 0.18
      const next = random(5)
      for (let i = 0; i < 260; i++) wrappedDot(context, next() * SIZE, next() * SIZE, 0.8 + next())
      context.globalAlpha = 1
      return { map, glow: null }
    }
    case 'asphalt':
      speckle(context, 5200, 9, [0.4, 1.2], 0.2)
      return { map, glow: null }
    case 'water': {
      context.strokeStyle = accent
      context.lineWidth = 2
      context.shadowColor = accent
      context.shadowBlur = 6
      const next = random(13)
      for (let row = 0; row < 8; row++) {
        const y = row * (SIZE / 8) + next() * 8
        const phase = next() * Math.PI * 2
        context.globalAlpha = 0.25 + next() * 0.25
        context.beginPath()
        for (let x = 0; x <= SIZE; x += 4) {
          const wave = Math.sin((x / SIZE) * Math.PI * 4 + phase) * 4
          if (x === 0) context.moveTo(x, y + wave)
          else context.lineTo(x, y + wave)
        }
        context.stroke()
      }
      context.globalAlpha = 1
      return { map, glow: null }
    }
    default:
      return null
  }
}

function texture(element: HTMLCanvasElement, color: boolean): CanvasTexture {
  const result = new CanvasTexture(element)
  result.wrapS = result.wrapT = RepeatWrapping
  result.anisotropy = 4
  if (color) result.colorSpace = SRGBColorSpace
  return result
}

/**
 * Textures for a patterned surface: a colour map (the base colour with the pattern drawn in) and, for
 * glowing patterns, an emissive mask. Each call returns its own textures (with their own repeat) sharing
 * one drawn image per pattern and colours; dispose them with the material.
 */
export function patternTextures(
  pattern: SurfacePattern,
  base: string,
  repeat: [number, number],
): { map: Texture; glow: Texture | null } | null {
  if (typeof document === 'undefined') return null
  const key = `${pattern.kind}|${base}|${pattern.color}`
  let source = sources.get(key)
  if (!source) {
    const drawn = draw(pattern.kind, base, pattern.color)
    if (!drawn) return null
    source = { map: texture(drawn.map, true), glow: drawn.glow ? texture(drawn.glow, false) : null }
    sources.set(key, source)
  }
  const own = (shared: CanvasTexture): Texture => {
    const copy = shared.clone()
    copy.repeat.set(...repeat)
    copy.userData.ownedPattern = true
    copy.needsUpdate = true
    return copy
  }
  return { map: own(source.map), glow: source.glow ? own(source.glow) : null }
}

/** Patterns that move (water flows slowly). */
export function flowSpeed(kind: string | undefined): number {
  return kind === 'water' ? 0.03 : 0
}
