/*
 * 后期处理链：场景 → 泛光、描边、调色、色调映射、抗锯齿 → 屏幕。
 * 开关某个效果时才重建处理链；只改参数时原地更新。
 */
import {
  BlendFunction,
  BloomEffect,
  BrightnessContrastEffect,
  type Effect,
  EffectComposer,
  EffectPass,
  FXAAEffect,
  HueSaturationEffect,
  KernelSize,
  OutlineEffect,
  RenderPass,
  SMAAEffect,
  SMAAPreset,
  ToneMappingEffect,
  ToneMappingMode,
  VignetteEffect,
} from 'postprocessing'
import { HalfFloatType, type Object3D, type PerspectiveCamera, type Scene, type WebGLRenderer } from 'three'
import type { QualityProfile } from './quality'

/** The authored look, independent of the device. */
export interface PostSettings {
  bloom: { enabled: boolean; intensity: number; threshold: number }
  vignette: boolean
  /** -1 … 1 */
  contrast: number
  /** -1 … 1 */
  saturation: number
}

export const defaultPostSettings = (): PostSettings => ({
  bloom: { enabled: true, intensity: 0.7, threshold: 1 },
  vignette: true,
  contrast: 0.05,
  saturation: 0.05,
})

export type OutlineChannel = 'selection' | 'hover'

/** Each outline channel masks its objects on its own camera layer. */
const outlineLayers: Record<OutlineChannel, number> = { selection: 11, hover: 12 }

const outlineColors: Record<OutlineChannel, number> = {
  selection: 0xf0a050,
  hover: 0x9ab0c8,
}

/**
 * Post-processing chain: scene → (bloom, outlines, grading, tone mapping, anti-aliasing) → screen. The pass
 * is rebuilt only when its set of effects changes; parameter tweaks are applied in place.
 */
export class RenderPipeline {
  private readonly composer: EffectComposer
  private readonly renderPass: RenderPass
  private effectPass: EffectPass | null = null
  private readonly outlines = new Map<OutlineChannel, OutlineEffect>()
  private readonly outlined = new Map<OutlineChannel, Object3D[]>()
  private bloom: BloomEffect | null = null
  private contrast: BrightnessContrastEffect | null = null
  private saturation: HueSaturationEffect | null = null
  private signature = ''
  private post: PostSettings = defaultPostSettings()

  constructor(
    renderer: WebGLRenderer,
    private readonly scene: Scene,
    private readonly camera: PerspectiveCamera,
    private profile: QualityProfile,
  ) {
    this.composer = new EffectComposer(renderer, {
      frameBufferType: HalfFloatType,
      multisampling: profile.multisampling,
    })
    this.renderPass = new RenderPass(scene, camera)
    this.composer.addPass(this.renderPass)
    this.rebuild()
  }

  setProfile(profile: QualityProfile): void {
    this.profile = profile
    this.composer.multisampling = profile.multisampling
    this.rebuild()
  }

  setPost(post: PostSettings): void {
    this.post = structuredClone(post)
    this.rebuild()
  }

  /** Objects drawn with an outline on a channel; an empty list clears it. Never recompiles shaders. */
  setOutlined(channel: OutlineChannel, objects: readonly Object3D[]): void {
    // The outline mask renders by camera layer, which only drawable objects carry: expand groups and
    // models to their meshes.
    const drawables: Object3D[] = []
    for (const object of objects)
      object.traverse(node => {
        if ((node as { isMesh?: boolean }).isMesh && !node.userData.editorInternal) drawables.push(node)
      })
    this.outlined.set(channel, drawables)
    this.outlines.get(channel)?.selection.set(drawables)
  }

  setSize(width: number, height: number): void {
    this.composer.setSize(width, height, false)
  }

  render(delta: number): void {
    this.composer.render(delta)
  }

  private rebuild(): void {
    const bloom = this.profile.bloom && this.post.bloom.enabled
    // Outline channels stay in the pass even when empty (an empty selection costs one texture read), so
    // selecting and hovering never recompile shaders. The cheapest tier keeps only the selection outline.
    const channels: OutlineChannel[] = this.profile.level === 'low' ? ['selection'] : ['selection', 'hover']
    const signature = JSON.stringify([
      bloom,
      this.profile.antialias,
      this.profile.extras,
      this.post.vignette,
      this.post.contrast !== 0,
      this.post.saturation !== 0,
      channels,
    ])
    if (signature === this.signature) {
      this.applyParameters()
      return
    }
    this.signature = signature
    if (this.effectPass) {
      this.composer.removePass(this.effectPass)
      this.effectPass.dispose()
    }
    for (const outline of this.outlines.values()) outline.dispose()
    this.outlines.clear()
    this.bloom = this.contrast = this.saturation = null

    const effects: Effect[] = []
    if (bloom) {
      this.bloom = new BloomEffect({
        mipmapBlur: true,
        intensity: this.post.bloom.intensity,
        luminanceThreshold: this.post.bloom.threshold,
        luminanceSmoothing: 0.08,
        radius: 0.7,
      })
      effects.push(this.bloom)
    }
    for (const channel of channels) {
      const outline = new OutlineEffect(this.scene, this.camera, {
        blendFunction: BlendFunction.SCREEN,
        edgeStrength: channel === 'hover' ? 2 : 4,
        visibleEdgeColor: outlineColors[channel],
        hiddenEdgeColor: channel === 'selection' ? 0x6a4a2a : 0x22303c,
        blur: true,
        kernelSize: KernelSize.VERY_SMALL,
        xRay: channel === 'selection',
      })
      outline.selection.layer = outlineLayers[channel]
      outline.selection.set(this.outlined.get(channel) ?? [])
      this.outlines.set(channel, outline)
      effects.push(outline)
    }
    if (this.post.contrast !== 0) {
      this.contrast = new BrightnessContrastEffect({ contrast: this.post.contrast })
      effects.push(this.contrast)
    }
    if (this.post.saturation !== 0) {
      this.saturation = new HueSaturationEffect({ saturation: this.post.saturation })
      effects.push(this.saturation)
    }
    // Khronos PBR Neutral keeps materials' base colours (brand colours, equipment paint) true on screen.
    effects.push(new ToneMappingEffect({ mode: ToneMappingMode.NEUTRAL }))
    if (this.post.vignette) effects.push(new VignetteEffect({ offset: 0.3, darkness: 0.45 }))
    effects.push(
      this.profile.antialias === 'smaa'
        ? new SMAAEffect({ preset: this.profile.extras ? SMAAPreset.ULTRA : SMAAPreset.MEDIUM })
        : new FXAAEffect(),
    )
    this.effectPass = new EffectPass(this.camera, ...effects)
    this.composer.addPass(this.effectPass)
  }

  private applyParameters(): void {
    if (this.bloom) {
      this.bloom.intensity = this.post.bloom.intensity
      this.bloom.luminanceMaterial.threshold = this.post.bloom.threshold
    }
    if (this.contrast) this.contrast.contrast = this.post.contrast
    if (this.saturation) this.saturation.saturation = this.post.saturation
  }

  dispose(): void {
    this.effectPass?.dispose()
    for (const outline of this.outlines.values()) outline.dispose()
    this.composer.dispose()
  }
}
