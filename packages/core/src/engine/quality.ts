/**
 * Render quality tiers. A scene's look (bloom on, shadows on…) is authored in the document; the tier decides
 * how much of it the current device can afford, so one project plays on a laptop and on a cinema wall.
 */
export type QualityLevel = 'low' | 'medium' | 'high'
export type QualitySetting = QualityLevel | 'auto'

export interface QualityProfile {
  level: QualityLevel
  /** Upper bound for the device pixel ratio (big screens rarely need more than 1–1.5). */
  maxPixelRatio: number
  shadows: boolean
  shadowMapSize: number
  bloom: boolean
  antialias: 'fxaa' | 'smaa'
  multisampling: number
  /** Ambient occlusion and other costly extras. */
  extras: boolean
}

export const qualityProfiles: Record<QualityLevel, QualityProfile> = {
  low: {
    level: 'low',
    maxPixelRatio: 1,
    shadows: false,
    shadowMapSize: 512,
    bloom: false,
    antialias: 'fxaa',
    multisampling: 0,
    extras: false,
  },
  medium: {
    level: 'medium',
    maxPixelRatio: 1.5,
    shadows: true,
    shadowMapSize: 1024,
    bloom: true,
    antialias: 'smaa',
    multisampling: 0,
    extras: false,
  },
  high: {
    level: 'high',
    maxPixelRatio: 2,
    shadows: true,
    shadowMapSize: 2048,
    bloom: true,
    antialias: 'smaa',
    // Multisampled HDR buffers break the outline passes; high-quality SMAA does the job at lower cost.
    multisampling: 0,
    extras: true,
  },
}

export const qualityLabels: Record<QualitySetting, string> = {
  auto: '自动',
  low: '流畅',
  medium: '均衡',
  high: '高清',
}

/** A conservative first guess for 'auto'; the adaptive controller corrects it within seconds. */
export function guessQualityLevel(gpuRenderer: string, cores: number, pixels: number): QualityLevel {
  const gpu = gpuRenderer.toLowerCase()
  if (/swiftshader|llvmpipe|software|basic render/.test(gpu)) return 'low'
  if (cores > 0 && cores <= 4) return 'low'
  // Very large canvases (4K walls) start at medium even on good GPUs; resolution is the dominant cost.
  if (pixels > 3840 * 2160 * 0.9) return 'medium'
  if (/apple m\d|rtx|radeon rx|geforce gtx 1[0-9]{3}|arc a/.test(gpu)) return 'high'
  return 'medium'
}

/**
 * Keeps the frame rate up by scaling the render resolution, then stepping the tier down. It never steps up
 * past the tier it started from, so a strong machine is not pushed into stutter by oscillation.
 */
export class AdaptiveQuality {
  private frames = 0
  private elapsed = 0
  private slowWindows = 0
  private fastWindows = 0
  scale = 1
  fps = 60

  constructor(
    private readonly onChange: (change: { scale: number; stepDown: boolean }) => void,
    private readonly minScale = 0.6,
  ) {}

  reset(): void {
    this.frames = 0
    this.elapsed = 0
    this.slowWindows = 0
    this.fastWindows = 0
    this.scale = 1
  }

  /** Feed frame times in seconds; decisions are made over one-second windows. */
  sample(delta: number, adaptive: boolean): void {
    if (delta <= 0 || delta > 1) return
    this.frames++
    this.elapsed += delta
    if (this.elapsed < 1) return
    this.fps = this.frames / this.elapsed
    this.frames = 0
    this.elapsed = 0
    if (!adaptive) return
    if (this.fps < 42) {
      this.fastWindows = 0
      if (++this.slowWindows < 2) return
      this.slowWindows = 0
      if (this.scale > this.minScale + 0.001) {
        this.scale = Math.max(this.minScale, this.scale - 0.15)
        this.onChange({ scale: this.scale, stepDown: false })
      } else this.onChange({ scale: this.scale, stepDown: true })
    } else if (this.fps > 57 && this.scale < 1) {
      this.slowWindows = 0
      if (++this.fastWindows < 4) return
      this.fastWindows = 0
      this.scale = Math.min(1, this.scale + 0.1)
      this.onChange({ scale: this.scale, stepDown: false })
    } else {
      this.slowWindows = 0
      this.fastWindows = 0
    }
  }
}
