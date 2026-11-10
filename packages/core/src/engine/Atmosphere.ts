/*
 * 天空与光照：按时间算太阳位置，天空（真实 / 渐变 / 纯色 / HDR）、环境光、阴影、雾。
 */
import {
  BackSide,
  Box3,
  CanvasTexture,
  CircleGeometry,
  Color,
  DirectionalLight,
  EquirectangularReflectionMapping,
  FogExp2,
  HemisphereLight,
  MathUtils,
  Mesh,
  MeshStandardMaterial,
  PMREMGenerator,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  type Texture,
  Vector3,
  type WebGLRenderer,
  type WebGLRenderTarget,
} from 'three'
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js'
import { Sky } from 'three/examples/jsm/objects/Sky.js'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import type { SceneSettingsV2 } from '../domain/scene/sceneSettingsV2'
import { Weather } from './Weather'

/** Sun direction for a time of day: rises in the east at 6, peaks at noon, sets in the west at 18. */
export function sunDirection(hour: number, azimuthDegrees: number, target = new Vector3()): Vector3 {
  const elevation = Math.sin(((hour - 6) / 12) * Math.PI) * MathUtils.degToRad(68)
  const azimuth = MathUtils.degToRad(azimuthDegrees) + ((hour - 12) / 12) * Math.PI
  return target.set(
    Math.sin(azimuth) * Math.cos(elevation),
    Math.sin(elevation),
    Math.cos(azimuth) * Math.cos(elevation),
  )
}

interface Palette {
  top: Color
  horizon: Color
  bottom: Color
  sun: Color
}
const palette = (top: string, horizon: string, bottom: string, sun: string): Palette => ({
  top: new Color(top),
  horizon: new Color(horizon),
  bottom: new Color(bottom),
  sun: new Color(sun),
})
const DAY = palette('#3f78c4', '#c9dbe9', '#3b4046', '#fff3e0')
const GOLDEN = palette('#34466f', '#f0a564', '#2c2a2c', '#ffb36b')
const NIGHT = palette('#03050a', '#122036', '#04060a', '#9db4ff')

function mixPalette(sunHeight: number): Palette & { day: number } {
  // sunHeight is sin(elevation): 1 overhead, 0 at the horizon, negative at night.
  const day = MathUtils.smoothstep(sunHeight, 0.02, 0.35)
  const night = 1 - MathUtils.smoothstep(sunHeight, -0.2, 0.02)
  const mix = (key: keyof Palette) => GOLDEN[key].clone().lerp(DAY[key], day).lerp(NIGHT[key], night)
  return { top: mix('top'), horizon: mix('horizon'), bottom: mix('bottom'), sun: mix('sun'), day: 1 - night }
}

const gradientSkyShader = {
  uniforms: {
    topColor: { value: new Color() },
    horizonColor: { value: new Color() },
    bottomColor: { value: new Color() },
    sunColor: { value: new Color() },
    sunDirection: { value: new Vector3(0, 1, 0) },
    night: { value: 0 },
  },
  vertexShader: /* glsl */ `
    varying vec3 vDirection;
    void main() {
      vDirection = (modelMatrix * vec4(position, 0.0)).xyz;
      vec4 clip = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      gl_Position = clip.xyww;
    }`,
  fragmentShader: /* glsl */ `
    uniform vec3 topColor; uniform vec3 horizonColor; uniform vec3 bottomColor; uniform vec3 sunColor;
    uniform vec3 sunDirection; uniform float night;
    varying vec3 vDirection;
    float hash(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
    void main() {
      vec3 dir = normalize(vDirection);
      float h = dir.y;
      vec3 color = h >= 0.0 ? mix(horizonColor, topColor, pow(h, 0.55)) : mix(horizonColor, bottomColor, pow(-h, 0.35));
      vec3 light = sunDirection.y > -0.05 ? sunDirection : -sunDirection;
      float facing = max(dot(dir, normalize(light)), 0.0);
      color += sunColor * (pow(facing, 900.0) * 6.0 + pow(facing, 12.0) * 0.25) * step(0.0, h + 0.02);
      if (night > 0.01 && h > 0.0) {
        vec3 cell = floor(dir * 520.0);
        float star = step(0.9975, hash(cell)) * hash(cell + 7.1);
        color += vec3(star) * night * smoothstep(0.0, 0.25, h) * 1.6;
      }
      gl_FragColor = vec4(color, 1.0);
    }`,
}

/**
 * three's physical sky is calibrated for exposure ≈ 0.5: at 1 its horizon clips to white and floods the
 * bloom pass. A brightness uniform scales it into the same range as the rest of the scene.
 */
function createSky(brightness: { value: number }): Sky {
  const sky = new Sky()
  const material = sky.material
  material.uniforms.skyBrightness = brightness
  material.fragmentShader = material.fragmentShader
    .replace('uniform float time;', 'uniform float time;\nuniform float skyBrightness;')
    .replace('gl_FragColor = vec4( texColor, 1.0 );', 'gl_FragColor = vec4( texColor * skyBrightness, 1.0 );')
  return sky
}

function radialFadeTexture(): CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 256
  const context = canvas.getContext('2d')!
  const gradient = context.createRadialGradient(128, 128, 0, 128, 128, 128)
  gradient.addColorStop(0, '#fff')
  gradient.addColorStop(0.8, '#fff')
  gradient.addColorStop(1, '#000')
  context.fillStyle = gradient
  context.fillRect(0, 0, 256, 256)
  return new CanvasTexture(canvas)
}

export interface AtmosphereApplyOptions {
  hdrUrl?: string | null
  shadows: boolean
  shadowMapSize: number
}

/** Sky, sun and moon, ambient light, ground, fog, weather and image-based lighting. */
export class Atmosphere {
  private readonly hemisphere = new HemisphereLight(0xffffff, 0x444444, 1)
  private readonly sun = new DirectionalLight(0xffffff, 2)
  private readonly skyBrightness = { value: 0.42 }
  private readonly physicalSky = createSky(this.skyBrightness)
  private readonly gradientSky: Mesh<SphereGeometry, ShaderMaterial>
  private readonly ground: Mesh<CircleGeometry, MeshStandardMaterial>
  /** Extends the ground to the horizon, where fog takes over; the sky never shows below the horizon. */
  private readonly floor: Mesh<CircleGeometry, MeshStandardMaterial>
  private readonly pmrem: PMREMGenerator
  /** 雨雪粒子，跟着镜头的观察点走。 */
  private readonly weather = new Weather()
  private readonly envScene = new Scene()
  private readonly envPhysical = createSky(this.skyBrightness)
  private readonly envGradient: Mesh<SphereGeometry, ShaderMaterial>
  private room: WebGLRenderTarget | null = null
  private environment: WebGLRenderTarget | null = null
  private hdr: { url: string; texture: Texture; target: WebGLRenderTarget } | null = null
  private settings: SceneSettingsV2 | null = null
  private envTimer: ReturnType<typeof setTimeout> | null = null
  private readonly bounds = new Box3(new Vector3(-50, 0, -50), new Vector3(50, 20, 50))
  private readonly direction = new Vector3()
  private disposed = false
  status = 'None'

  constructor(
    private readonly renderer: WebGLRenderer,
    private readonly scene: Scene,
  ) {
    this.pmrem = new PMREMGenerator(renderer)
    this.hemisphere.name = 'Atmosphere Ambient'
    this.sun.name = 'Atmosphere Sun'
    this.sun.shadow.bias = -0.0004
    this.sun.shadow.normalBias = 0.03
    this.sun.shadow.radius = 3
    this.physicalSky.scale.setScalar(9000)
    this.physicalSky.name = 'Atmosphere Sky'
    this.gradientSky = new Mesh(
      new SphereGeometry(9000, 32, 16),
      new ShaderMaterial({ ...gradientSkyShader, side: BackSide, depthWrite: false, fog: false }),
    )
    this.gradientSky.name = 'Atmosphere Gradient Sky'
    this.envPhysical.scale.setScalar(100)
    // The environment copy shares the visible sky's uniforms (sun, clouds, brightness).
    this.envPhysical.material.uniforms = this.physicalSky.material.uniforms
    this.envGradient = new Mesh(new SphereGeometry(100, 32, 16), this.gradientSky.material)
    this.envScene.add(this.envPhysical, this.envGradient)
    const groundMaterial = new MeshStandardMaterial({
      roughness: 0.96,
      metalness: 0,
      transparent: true,
      alphaMap: radialFadeTexture(),
      depthWrite: false,
    })
    this.ground = new Mesh(new CircleGeometry(0.5, 96).rotateX(-Math.PI / 2), groundMaterial)
    this.ground.name = 'Atmosphere Ground'
    this.ground.position.y = -0.02
    this.ground.receiveShadow = true
    this.ground.renderOrder = -1
    this.floor = new Mesh(
      new CircleGeometry(7000, 64).rotateX(-Math.PI / 2),
      new MeshStandardMaterial({
        roughness: 1,
        metalness: 0,
        polygonOffset: true,
        polygonOffsetFactor: 2,
        polygonOffsetUnits: 2,
      }),
    )
    this.floor.name = 'Atmosphere Floor'
    this.floor.position.y = -0.06
    this.floor.receiveShadow = true
    for (const object of [
      this.hemisphere,
      this.sun,
      this.sun.target,
      this.physicalSky,
      this.gradientSky,
      this.floor,
      this.ground,
      this.weather.object,
    ]) {
      object.userData.editorInternal = true
      object.raycast = () => {}
      scene.add(object)
    }
  }

  /** Applies the authored look. Resolves once any HDR image is loaded (or has failed, see `status`). */
  async apply(settings: SceneSettingsV2, options: AtmosphereApplyOptions): Promise<void> {
    if (this.disposed) return
    this.settings = settings
    const { sky, time, lighting, fog, ground, post, weather } = settings
    sunDirection(time.hour, time.azimuth, this.direction)
    const colors = mixPalette(this.direction.y)
    const night = 1 - colors.day

    // Lights: the sun by day, a cool moon by night.
    const sunUp = this.direction.y > -0.02
    const lightDirection = sunUp
      ? this.direction.clone()
      : new Vector3(-this.direction.x, Math.max(0.55, -this.direction.y), -this.direction.z).normalize()
    const sunStrength = sunUp ? MathUtils.smoothstep(this.direction.y, -0.02, 0.2) : 0.28 * night
    this.sun.intensity = lighting.sunIntensity * Math.max(sunStrength, sunUp ? 0.12 : 0)
    this.sun.color.copy(sunUp ? colors.sun : NIGHT.sun)
    this.sun.userData.direction = lightDirection
    this.hemisphere.intensity = lighting.ambientIntensity * (0.35 + 0.65 * colors.day)
    this.hemisphere.color.copy(colors.top).lerp(new Color(0xffffff), 0.5)
    this.hemisphere.groundColor.set(ground.color).multiplyScalar(0.6)
    this.sun.castShadow = lighting.shadows && options.shadows
    if (this.sun.shadow.mapSize.x !== options.shadowMapSize) {
      this.sun.shadow.mapSize.set(options.shadowMapSize, options.shadowMapSize)
      this.sun.shadow.map?.dispose()
      this.sun.shadow.map = null
    }
    this.renderer.shadowMap.enabled = true
    this.fitShadow()

    // Sky.
    const uniforms = this.physicalSky.material.uniforms
    uniforms.sunPosition!.value.copy(this.direction)
    uniforms.turbidity!.value = 4
    uniforms.rayleigh!.value = sunUp ? 1.2 : 0.3
    uniforms.mieCoefficient!.value = 0.004
    uniforms.mieDirectionalG!.value = 0.8
    uniforms.cloudCoverage!.value = 0.35
    uniforms.showSunDisc!.value = 1
    const gradient = this.gradientSky.material.uniforms
    gradient.topColor!.value.copy(colors.top)
    gradient.horizonColor!.value.copy(colors.horizon)
    gradient.bottomColor!.value.copy(colors.bottom)
    gradient.sunColor!.value.copy(sunUp ? colors.sun : NIGHT.sun).multiplyScalar(sunUp ? 1 : 0.4)
    gradient.sunDirection!.value.copy(this.direction)
    gradient.night!.value = night

    let mode = sky.mode
    if (mode === 'hdr') {
      if (options.hdrUrl) {
        try {
          await this.loadHdr(options.hdrUrl)
          if (this.disposed || this.settings !== settings) return
          this.status = 'HDR'
        } catch {
          this.status = 'Fallback'
          mode = 'physical'
        }
      } else mode = 'physical'
    }
    // Physical skies are black at night; the gradient sky carries the stars and city glow instead.
    if (mode === 'physical' && night > 0.85) mode = 'gradient'
    this.physicalSky.visible = mode === 'physical'
    this.gradientSky.visible = mode === 'gradient'
    this.envPhysical.visible = mode === 'physical'
    this.envGradient.visible = mode === 'gradient'
    if (mode === 'color') this.scene.background = new Color(sky.color)
    else if (mode === 'hdr' && this.hdr) {
      this.scene.background = this.hdr.texture
      // HDR skies carry values far above 1: dim and soften the backdrop so it frames the scene instead of
      // flooding the bloom pass. Lighting from the image keeps its full strength.
      this.scene.backgroundBlurriness = 0.12
      this.scene.backgroundIntensity = 0.5
    } else {
      this.scene.background = null
      this.scene.backgroundIntensity = 1
    }
    if (mode !== 'hdr') this.status = mode

    // Image-based lighting.
    this.scene.environmentIntensity = sky.environmentIntensity * (0.25 + 0.75 * colors.day)
    if (mode === 'hdr' && this.hdr) this.scene.environment = this.hdr.target.texture
    else if (mode === 'color') {
      this.room ??= this.pmrem.fromScene(new RoomEnvironment(), 0.04)
      this.scene.environment = this.room.texture
    } else this.scheduleEnvironment()

    // Ground, fog, exposure, weather.
    this.ground.visible = ground.enabled
    this.ground.scale.setScalar(ground.size)
    this.ground.material.color.set(ground.color)
    // Open skies need ground up to the horizon even when the plot itself is hidden.
    this.floor.visible = ground.enabled || mode === 'physical' || mode === 'gradient'
    this.floor.material.color.set(ground.color).multiplyScalar(0.82)
    const fogColor = mode === 'color' ? new Color(sky.color) : colors.horizon.clone()
    this.scene.fog = fog.enabled ? new FogExp2(fogColor, 0) : null
    this.fitFog()
    this.renderer.toneMappingExposure = post.exposure
    this.weather.configure(weather.kind, weather.intensity)
  }

  /** Shadows cover the scene content; call when its bounds change. */
  setContentBounds(box: Box3): void {
    if (box.isEmpty()) return
    this.bounds.copy(box)
    this.fitShadow()
    this.fitFog()
  }

  /** Haze is relative: density 1 hides things about two scene radii away, whatever the scene's scale. */
  private fitFog(): void {
    const fog = this.scene.fog
    if (!(fog instanceof FogExp2) || !this.settings) return
    const radius = Math.max(40, this.bounds.getSize(new Vector3()).length() / 2)
    fog.density = (this.settings.fog.density * 0.9) / (radius * 2)
  }

  /** 每帧：天空跟着镜头，云和雨雪动起来；雨雪围绕镜头的观察点 focus。 */
  update(delta: number, cameraPosition: Vector3, focus: Vector3): void {
    this.physicalSky.position.copy(cameraPosition)
    this.gradientSky.position.copy(cameraPosition)
    const uniforms = this.physicalSky.material.uniforms
    uniforms.time!.value += delta
    this.weather.update(delta, focus)
  }

  private fitShadow(): void {
    const center = this.bounds.getCenter(new Vector3())
    const radius = Math.max(10, this.bounds.getSize(new Vector3()).length() / 2)
    const direction = (this.sun.userData.direction as Vector3 | undefined) ?? this.direction
    this.sun.position.copy(center).addScaledVector(direction, radius * 2)
    this.sun.target.position.copy(center)
    this.sun.target.updateMatrixWorld()
    const camera = this.sun.shadow.camera
    camera.left = camera.bottom = -radius
    camera.right = camera.top = radius
    camera.near = 0.5
    camera.far = radius * 4
    camera.updateProjectionMatrix()
  }

  private scheduleEnvironment(): void {
    if (this.envTimer) clearTimeout(this.envTimer)
    // Regenerating the environment map costs a few milliseconds; coalesce slider drags.
    this.envTimer = setTimeout(
      () => {
        this.envTimer = null
        if (this.disposed) return
        const previous = this.environment
        // The sun disc is thousands of times brighter than the sky: captured into the environment map it
        // floods every surface white (or not, depending on whether it lands on a texel). Sunlight comes from
        // the directional light; the environment carries only the sky.
        const uniforms = this.physicalSky.material.uniforms
        const disc = uniforms.showSunDisc!.value
        uniforms.showSunDisc!.value = 0
        this.environment = this.pmrem.fromScene(this.envScene, 0.02, 0.1, 1000)
        uniforms.showSunDisc!.value = disc
        this.scene.environment = this.environment.texture
        previous?.dispose()
      },
      this.environment ? 90 : 0,
    )
  }

  private async loadHdr(url: string): Promise<void> {
    if (this.hdr?.url === url) return
    const texture = await new HDRLoader().loadAsync(url)
    if (this.disposed) {
      texture.dispose()
      return
    }
    texture.mapping = EquirectangularReflectionMapping
    const target = this.pmrem.fromEquirectangular(texture)
    this.hdr?.texture.dispose()
    this.hdr?.target.dispose()
    this.hdr = { url, texture, target }
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    if (this.envTimer) clearTimeout(this.envTimer)
    for (const object of [
      this.hemisphere,
      this.sun,
      this.sun.target,
      this.physicalSky,
      this.gradientSky,
      this.floor,
      this.ground,
      this.weather.object,
    ])
      object.removeFromParent()
    this.weather.dispose()
    this.floor.geometry.dispose()
    this.floor.material.dispose()
    this.physicalSky.geometry.dispose()
    this.physicalSky.material.dispose()
    this.gradientSky.geometry.dispose()
    this.gradientSky.material.dispose()
    this.envGradient.geometry.dispose()
    this.envPhysical.geometry.dispose()
    this.ground.geometry.dispose()
    this.ground.material.alphaMap?.dispose()
    this.ground.material.dispose()
    this.sun.shadow.map?.dispose()
    this.environment?.dispose()
    this.room?.dispose()
    this.hdr?.texture.dispose()
    this.hdr?.target.dispose()
    this.pmrem.dispose()
    if (this.scene.environment) this.scene.environment = null
    this.scene.fog = null
    this.scene.background = null
  }
}
