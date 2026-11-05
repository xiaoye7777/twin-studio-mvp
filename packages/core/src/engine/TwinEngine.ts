/*
 * TwinEngine：一块画布一个三维引擎（three.js），编辑器和 Viewer 共用。
 * 负责渲染器、场景、相机（CameraRig）、后期处理（RenderPipeline）、天空光照（Atmosphere）、拾取、截图和帧循环。
 * 业务对象都放在 content 下；天空、地面、辅助线等是基础设施，拾取时忽略。
 */
import {
  AxesHelper,
  Box3,
  Group,
  type Intersection,
  Mesh,
  type Object3D,
  PCFShadowMap,
  PerspectiveCamera,
  Plane,
  Raycaster,
  Scene,
  SRGBColorSpace,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three'
import { acceleratedRaycast, computeBoundsTree, disposeBoundsTree } from 'three-mesh-bvh'
import type { SceneSettingsV2 } from '../domain/scene/sceneSettingsV2'
import { Atmosphere } from './Atmosphere'
import { type CameraView, CameraRig } from './CameraRig'
import { InfiniteGrid } from './InfiniteGrid'
import { ModelLoader } from './ModelLoader'
import {
  AdaptiveQuality,
  guessQualityLevel,
  type QualityLevel,
  type QualityProfile,
  qualityProfiles,
  type QualitySetting,
} from './quality'
import { type OutlineChannel, RenderPipeline } from './RenderPipeline'

export interface TwinEngineOptions {
  quality?: QualitySetting
  /** Editor scenes keep the drawing buffer for thumbnails and screenshots. */
  preserveDrawingBuffer?: boolean
  /** Serve the Draco decoder from here instead of the bundled copy (rarely needed). */
  dracoDecoderPath?: string
}

export interface EngineStats {
  fps: number
  quality: QualityLevel
  setting: QualitySetting
  pixelRatio: number
  drawCalls: number
  triangles: number
}

export interface PickResult {
  object: Object3D
  point: Vector3
  distance: number
}

const LOWER: Record<QualityLevel, QualityLevel> = { high: 'medium', medium: 'low', low: 'low' }

/**
 * The rendering engine shared by the Editor and the Viewer: one renderer, scene, camera rig and
 * post-processing chain per canvas. Business objects live under `content`; everything else (sky, ground,
 * effects, helpers) is infrastructure that picking ignores.
 */
export class TwinEngine {
  readonly renderer: WebGLRenderer
  readonly scene = new Scene()
  readonly camera = new PerspectiveCamera(45, 1, 0.1, 20000)
  readonly content = new Group()
  /** Editor gizmos: rendered, never picked. */
  readonly overlay = new Group()
  readonly rig: CameraRig
  readonly atmosphere: Atmosphere
  readonly loader: ModelLoader
  private readonly pipeline: RenderPipeline
  private lastFrame = performance.now()
  private lastInfo = { calls: 0, triangles: 0 }
  private elapsed = 0
  private readonly raycaster = new Raycaster()
  private readonly pickables = new Set<Object3D>()
  private readonly frameListeners = new Set<(delta: number, elapsed: number) => void>()
  private readonly adaptive: AdaptiveQuality
  private readonly resizeObserver: ResizeObserver
  private grid: InfiniteGrid | null = null
  private axes: AxesHelper | null = null
  private qualitySetting: QualitySetting
  private profile: QualityProfile
  private baseProfile: QualityLevel
  private width = 1
  private height = 1
  private contentDirty = true
  private contentBoundsTimer = 0
  private settings: SceneSettingsV2 | null = null
  private settingsOptions: { hdrUrl?: string | null } = {}
  private running = true
  private contextLost = false
  private disposed = false
  readonly contentBounds = new Box3()

  constructor(
    readonly canvas: HTMLCanvasElement,
    options: TwinEngineOptions = {},
  ) {
    this.renderer = new WebGLRenderer({
      canvas,
      antialias: false,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: options.preserveDrawingBuffer ?? false,
      stencil: false,
    })
    this.renderer.outputColorSpace = SRGBColorSpace
    // Post-processing renders several passes per frame; statistics are reset once per frame instead.
    this.renderer.info.autoReset = false
    this.renderer.shadowMap.type = PCFShadowMap
    this.raycaster.firstHitOnly = true
    this.qualitySetting = options.quality ?? 'auto'
    this.baseProfile = this.resolveLevel(this.qualitySetting)
    this.profile = qualityProfiles[this.baseProfile]
    this.content.name = 'Content'
    this.overlay.name = 'Overlay'
    this.overlay.userData.editorInternal = true
    this.scene.add(this.content, this.overlay)
    this.rig = new CameraRig(this.camera, canvas)
    this.rig.flyTo({ position: [60, 45, 60], target: [0, 0, 0] }, { duration: 0 })
    this.atmosphere = new Atmosphere(this.renderer, this.scene)
    this.loader = new ModelLoader({ renderer: this.renderer, dracoDecoderPath: options.dracoDecoderPath })
    this.pipeline = new RenderPipeline(this.renderer, this.scene, this.camera, this.profile)
    this.adaptive = new AdaptiveQuality(({ scale, stepDown }) => {
      if (stepDown && this.profile.level !== 'low') this.applyProfile(LOWER[this.profile.level])
      else this.resize(scale)
    })
    this.resizeObserver = new ResizeObserver(() => this.resize())
    this.resizeObserver.observe(canvas)
    canvas.addEventListener('webglcontextlost', this.onContextLost)
    canvas.addEventListener('webglcontextrestored', this.onContextRestored)
    document.addEventListener('visibilitychange', this.onVisibility)
    this.resize()
    this.renderer.setAnimationLoop(this.frame)
  }

  // ---------------------------------------------------------------- content (SceneHost)

  addObject<T extends Object3D>(object: T): boolean {
    if (this.disposed) return false
    this.prepare(object)
    this.content.add(object)
    this.pickables.add(object)
    this.contentDirty = true
    return true
  }

  removeObject(object: Object3D): void {
    this.pickables.delete(object)
    object.removeFromParent()
    this.contentDirty = true
  }

  /** Call after changing the subtree of an added object (e.g. adding children). */
  refreshObject(object: Object3D): void {
    this.prepare(object)
    this.contentDirty = true
  }

  loadGLTFModel(url: string): Promise<Object3D> {
    return this.loader.load(url)
  }

  getScene(): Scene {
    return this.scene
  }

  getCamera(): PerspectiveCamera {
    return this.camera
  }

  private prepare(object: Object3D): void {
    object.traverse(node => {
      if (!(node instanceof Mesh) || node.userData.editorInternal) return
      const geometry = node.geometry
      if (geometry.attributes.position && !geometry.boundsTree && geometry.attributes.position.count > 600) {
        computeBoundsTree.call(geometry)
        geometry.addEventListener('dispose', () => disposeBoundsTree.call(geometry))
      }
      node.raycast = acceleratedRaycast
    })
  }

  // ---------------------------------------------------------------- look

  /** Applies authored scene settings (sky, light, fog, post-processing). */
  async applySettings(settings: SceneSettingsV2, options: { hdrUrl?: string | null } = {}): Promise<void> {
    this.settings = settings
    this.settingsOptions = options
    this.pipeline.setPost({
      bloom: settings.post.bloom,
      vignette: settings.post.vignette,
      contrast: settings.post.contrast,
      saturation: settings.post.saturation,
    })
    await this.atmosphere.apply(settings, {
      hdrUrl: options.hdrUrl,
      shadows: this.profile.shadows,
      shadowMapSize: this.profile.shadowMapSize,
    })
  }

  get environmentStatus(): string {
    return this.atmosphere.status
  }

  /** Editor helpers; never shown by the Viewer. */
  setHelpers(helpers: { grid: boolean; axes: boolean }): void {
    if (helpers.grid && !this.grid) {
      this.grid = new InfiniteGrid()
      this.scene.add(this.grid)
    }
    if (this.grid) this.grid.visible = helpers.grid
    if (helpers.axes && !this.axes) {
      this.axes = new AxesHelper(8)
      this.axes.userData.editorInternal = true
      this.axes.raycast = () => {}
      this.scene.add(this.axes)
    }
    if (this.axes) this.axes.visible = helpers.axes
  }

  // ---------------------------------------------------------------- camera

  flyTo(view: CameraView, duration = 1.2): Promise<boolean> {
    return this.rig.flyTo(view, { duration })
  }

  /** 把相机移到能框住这个范围的位置。 */
  focusBox(box: Box3, duration = 0.8): Promise<boolean> {
    return this.rig.fitBox(box, { duration })
  }

  /** Frames everything in the scene. */
  fitAll(duration = 0.8): Promise<boolean> {
    this.updateContentBounds()
    if (this.contentBounds.isEmpty()) return Promise.resolve(false)
    return this.rig.fitBox(this.contentBounds, { duration, padding: 1.05 })
  }

  setControlsEnabled(enabled: boolean): void {
    this.rig.enabled = enabled
  }

  // ---------------------------------------------------------------- picking

  /** Normalised device coordinates for a client point, or null outside the canvas. */
  toNdc(clientX: number, clientY: number): Vector2 | null {
    const rect = this.canvas.getBoundingClientRect()
    if (!rect.width || !rect.height) return null
    if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) return null
    return new Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1)
  }

  /** 射线命中的业务对象，由近到远；隐藏的对象和基础设施跳过。信息面板总画在最上层，所以点击也先算它。 */
  raycastObjects(ndc: Vector2, _options: unknown = {}): Intersection<Object3D>[] {
    this.raycaster.setFromCamera(ndc, this.camera)
    this.raycaster.firstHitOnly = true
    const hits = this.raycaster.intersectObjects([...this.pickables], true)
    return hits
      .filter(hit => {
        for (let node: Object3D | null = hit.object; node && node !== this.content; node = node.parent) {
          if (!node.visible || node.userData.editorInternal) return false
        }
        return true
      })
      .sort((a, b) => Number(!!b.object.userData.panelSprite) - Number(!!a.object.userData.panelSprite))
  }

  pick(clientX: number, clientY: number): PickResult | null {
    const ndc = this.toNdc(clientX, clientY)
    if (!ndc) return null
    const hit = this.raycastObjects(ndc)[0]
    return hit ? { object: hit.object, point: hit.point.clone(), distance: hit.distance } : null
  }

  /** Where a screen point meets the ground plane (y = height). */
  raycastGround(ndc: Vector2, height = 0): Vector3 | null {
    this.raycaster.setFromCamera(ndc, this.camera)
    return this.raycaster.ray.intersectPlane(new Plane(new Vector3(0, 1, 0), -height), new Vector3())
  }

  /** 光标下的物体表面（面板不算，放东西时要穿过它）：命中的物体和位置；没有物体时 object 是 null，位置在地面上。 */
  surfaceAt(clientX: number, clientY: number): { object: Object3D | null; point: Vector3 } | null {
    const ndc = this.toNdc(clientX, clientY)
    if (!ndc) return null
    const hit = this.raycastObjects(ndc).find(item => !item.object.userData.panelSprite)
    if (hit) return { object: hit.object, point: hit.point.clone() }
    const ground = this.raycastGround(ndc)
    return ground ? { object: null, point: ground } : null
  }

  /** The surface point under the cursor: the nearest object hit, else the ground. */
  pointAt(clientX: number, clientY: number): Vector3 | null {
    return this.surfaceAt(clientX, clientY)?.point ?? null
  }

  // ---------------------------------------------------------------- outlines

  setOutlined(channel: OutlineChannel, objects: readonly Object3D[]): void {
    this.pipeline.setOutlined(channel, objects)
  }

  // ---------------------------------------------------------------- loop, quality, sizing

  /** Runs every frame before rendering. Returns an unsubscribe function. */
  onFrame(listener: (delta: number, elapsed: number) => void): () => void {
    this.frameListeners.add(listener)
    return () => this.frameListeners.delete(listener)
  }

  get quality(): QualitySetting {
    return this.qualitySetting
  }

  setQuality(setting: QualitySetting): void {
    this.qualitySetting = setting
    this.baseProfile = this.resolveLevel(setting)
    this.adaptive.reset()
    this.applyProfile(this.baseProfile)
  }

  getStats(): EngineStats {
    return {
      fps: Math.round(this.adaptive.fps),
      quality: this.profile.level,
      setting: this.qualitySetting,
      pixelRatio: Math.round(this.renderer.getPixelRatio() * 100) / 100,
      drawCalls: this.lastInfo.calls,
      triangles: this.lastInfo.triangles,
    }
  }

  /** A PNG of the current frame. */
  async screenshot(width?: number): Promise<Blob | null> {
    this.renderFrame(0)
    const blob = await new Promise<Blob | null>(resolve => this.canvas.toBlob(resolve, 'image/png'))
    return blob && width ? this.downscale(blob, width) : blob
  }

  /**
   * A picture of the scene from another viewpoint, without moving the user's camera: the pose is set,
   * one frame rendered and copied, and the pose restored before the browser paints.
   */
  async renderView(view: CameraView, width: number): Promise<Blob | null> {
    const camera = this.camera
    const position = camera.position.clone()
    const quaternion = camera.quaternion.clone()
    const fov = camera.fov
    const resolved = this.rig.resolveView(view)
    camera.position.copy(resolved.position)
    camera.up.set(0, 1, 0)
    camera.lookAt(resolved.target)
    if (view.fov) camera.fov = view.fov
    camera.updateProjectionMatrix()
    camera.updateMatrixWorld()
    this.renderer.info.reset()
    this.pipeline.render(0)
    // toBlob copies the canvas bitmap synchronously, so the camera can be restored right away.
    const pending = new Promise<Blob | null>(resolve => this.canvas.toBlob(resolve, 'image/png'))
    camera.position.copy(position)
    camera.quaternion.copy(quaternion)
    camera.fov = fov
    camera.updateProjectionMatrix()
    camera.updateMatrixWorld()
    const blob = await pending
    return blob ? this.downscale(blob, width) : null
  }

  private async downscale(blob: Blob, width: number): Promise<Blob | null> {
    const bitmap = await createImageBitmap(blob)
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = Math.round((bitmap.height / bitmap.width) * width)
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    return new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.86))
  }

  private resolveLevel(setting: QualitySetting): QualityLevel {
    if (setting !== 'auto') return setting
    const gl = this.renderer.getContext()
    const info = gl.getExtension('WEBGL_debug_renderer_info')
    const gpu = info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : ''
    const pixels = this.canvas.clientWidth * this.canvas.clientHeight * Math.min(window.devicePixelRatio, 2) ** 2
    return guessQualityLevel(gpu, navigator.hardwareConcurrency ?? 0, pixels)
  }

  private applyProfile(level: QualityLevel): void {
    this.profile = qualityProfiles[level]
    this.pipeline.setProfile(this.profile)
    this.resize(this.adaptive.scale)
    if (this.settings) void this.applySettings(this.settings, this.settingsOptions)
  }

  private resize(scale = this.adaptive.scale): void {
    if (this.disposed) return
    const width = Math.max(1, this.canvas.clientWidth)
    const height = Math.max(1, this.canvas.clientHeight)
    const ratio = Math.min(window.devicePixelRatio || 1, this.profile.maxPixelRatio) * scale
    this.width = width
    this.height = height
    this.renderer.setPixelRatio(Math.max(0.5, ratio))
    this.renderer.setSize(width, height, false)
    this.pipeline.setSize(width, height)
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
  }

  private updateContentBounds(): void {
    this.contentBounds.makeEmpty()
    for (const object of this.pickables) if (object.visible) this.contentBounds.expandByObject(object, true)
  }

  private readonly frame = (): void => {
    if (!this.running || this.contextLost || this.disposed) return
    const now = performance.now()
    const delta = Math.min((now - this.lastFrame) / 1000, 0.1)
    this.lastFrame = now
    this.elapsed += delta
    if (this.canvas.clientWidth !== this.width || this.canvas.clientHeight !== this.height) this.resize()
    this.renderFrame(delta)
    this.adaptive.sample(delta, this.qualitySetting === 'auto')
  }

  private renderFrame(delta: number): void {
    const elapsed = this.elapsed
    this.rig.update(delta)
    if (this.contentDirty && elapsed - this.contentBoundsTimer > 0.5) {
      this.contentDirty = false
      this.contentBoundsTimer = elapsed
      this.updateContentBounds()
      this.atmosphere.setContentBounds(this.contentBounds)
    }
    this.atmosphere.update(delta, this.camera.position)
    for (const listener of this.frameListeners) listener(delta, elapsed)
    this.renderer.info.reset()
    this.pipeline.render(delta)
    this.lastInfo = { calls: this.renderer.info.render.calls, triangles: this.renderer.info.render.triangles }
  }

  private readonly onVisibility = (): void => {
    this.running = document.visibilityState !== 'hidden'
    if (this.running) this.lastFrame = performance.now()
  }

  private readonly onContextLost = (event: Event): void => {
    event.preventDefault()
    this.contextLost = true
  }

  private readonly onContextRestored = (): void => {
    this.contextLost = false
    // Three re-uploads geometry and textures lazily; the composer's targets and passes are rebuilt here.
    this.applyProfile(this.profile.level)
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.renderer.setAnimationLoop(null)
    this.resizeObserver.disconnect()
    this.canvas.removeEventListener('webglcontextlost', this.onContextLost)
    this.canvas.removeEventListener('webglcontextrestored', this.onContextRestored)
    document.removeEventListener('visibilitychange', this.onVisibility)
    this.frameListeners.clear()
    this.rig.dispose()
    this.atmosphere.dispose()
    this.pipeline.dispose()
    this.grid?.dispose()
    this.axes?.dispose()
    this.loader.dispose()
    this.content.traverse(node => {
      if (node instanceof Mesh && !node.userData.sharedResources) {
        // Model clones share the loader's resources (freed above); primitives own theirs.
        if (node.userData.ownsResources) {
          node.geometry.dispose()
          for (const material of Array.isArray(node.material) ? node.material : [node.material]) material.dispose()
        }
      }
    })
    this.renderer.dispose()
    this.renderer.forceContextLoss()
  }
}
