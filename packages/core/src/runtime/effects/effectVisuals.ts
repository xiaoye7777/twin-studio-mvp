/*
 * 每种特效的三维表现：创建辅助对象（标牌、光圈、扫描面…）、每帧更新、读取设备数据显示在标牌上。
 * 直接作用在目标本身的特效（描边、高亮）不需要辅助对象。
 */
import {
  AdditiveBlending,
  type Box3,
  BoxGeometry,
  BufferGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  EdgesGeometry,
  Float32BufferAttribute,
  Group,
  LineBasicMaterial,
  LineSegments,
  type Material,
  Mesh,
  MeshBasicMaterial,
  type Object3D,
  Path,
  RingGeometry,
  ShaderMaterial,
  Shape,
  ShapeGeometry,
  Vector3,
} from 'three'
import type { EffectInstance } from '../../domain/effects'
import { sceneTime } from '../scene/nodeObjects'
import { TextSprite } from '../scene/textSprite'

/** Live device data for data labels: a title and "name\tvalue" rows. */
export interface EffectDataLines {
  title: string
  rows: string[]
}

export interface EffectFrame {
  bounds: Box3
  size: Vector3
  center: Vector3
  time: number
  /** Device data for data-label effects (null when the target has no binding). */
  data: EffectDataLines | null
}

export interface EffectVisual {
  object: Object3D
  update(frame: EffectFrame): void
  dispose(): void
}

function additive(color: string, opacity: number): MeshBasicMaterial {
  return new MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthWrite: false,
    side: DoubleSide,
    blending: AdditiveBlending,
  })
}

function disposeTree(object: Object3D): void {
  object.traverse(node => {
    if (node instanceof TextSprite) node.dispose()
    else if (node instanceof Mesh || node instanceof LineSegments) {
      node.geometry.dispose()
      ;(node.material as Material).dispose()
    }
  })
}

const visual = (object: Object3D, update: EffectVisual['update']): EffectVisual => ({
  object,
  update,
  dispose: () => disposeTree(object),
})

function boxGlow(effect: EffectInstance): EffectVisual {
  const { color, opacity, speed, padding } = effect.parameters
  const geometry = new BoxGeometry(1, 1, 1)
  const surface = additive(color, opacity * 0.12)
  const line = new LineBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthWrite: false,
    blending: AdditiveBlending,
  })
  const group = new Group()
  group.add(new Mesh(geometry, surface), new LineSegments(new EdgesGeometry(geometry), line))
  return visual(group, ({ size, center, time }) => {
    group.position.copy(center)
    group.scale.copy(size).addScalar(padding * 2)
    const breath = speed === 0 ? 1 : 0.55 + 0.45 * Math.sin(time * speed * Math.PI * 2)
    surface.opacity = opacity * breath * 0.12
    line.opacity = opacity * breath
  })
}

function groundPulse(effect: EffectInstance): EffectVisual {
  const { color, opacity, speed, padding } = effect.parameters
  const shape = new Shape()
  shape.moveTo(-0.5, -0.5)
  shape.lineTo(0.5, -0.5)
  shape.lineTo(0.5, 0.5)
  shape.lineTo(-0.5, 0.5)
  shape.closePath()
  const hole = new Path()
  hole.moveTo(-0.45, -0.45)
  hole.lineTo(-0.45, 0.45)
  hole.lineTo(0.45, 0.45)
  hole.lineTo(0.45, -0.45)
  hole.closePath()
  shape.holes.push(hole)
  const material = additive(color, opacity)
  const mesh = new Mesh(new ShapeGeometry(shape).rotateX(-Math.PI / 2), material)
  return visual(mesh, ({ bounds, size, center, time }) => {
    const pulse = speed === 0 ? 0.5 : (time * speed) % 1
    mesh.position.set(center.x, bounds.min.y + 0.03, center.z)
    mesh.scale.set((size.x + padding * 2) * (1 + pulse * 0.35), 1, (size.z + padding * 2) * (1 + pulse * 0.35))
    material.opacity = opacity * (1 - pulse)
  })
}

function ripple(effect: EffectInstance): EffectVisual {
  const { color, opacity, speed, padding } = effect.parameters
  const group = new Group()
  const rings = [0, 1, 2].map(() => {
    const material = additive(color, opacity)
    const mesh = new Mesh(new RingGeometry(0.92, 1, 64).rotateX(-Math.PI / 2), material)
    group.add(mesh)
    return { mesh, material }
  })
  return visual(group, ({ bounds, size, center, time }) => {
    group.position.set(center.x, bounds.min.y + 0.04, center.z)
    const radius = Math.max(size.x, size.z) / 2 + padding
    rings.forEach(({ mesh, material }, index) => {
      const phase = speed === 0 ? (index + 1) / 3 : (time * speed * 0.6 + index / 3) % 1
      mesh.scale.setScalar(Math.max(0.01, radius * (0.25 + phase)))
      material.opacity = opacity * (1 - phase) ** 1.4
    })
  })
}

const radarShader = {
  vertexShader: /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform vec3 color; uniform float opacity; uniform float angle;
    varying vec2 vUv;
    void main() {
      vec2 p = vUv * 2.0 - 1.0;
      float r = length(p);
      if (r > 1.0) discard;
      float a = atan(p.y, p.x);
      float sweep = mod(angle - a, 6.28318) / 6.28318;
      float trail = pow(1.0 - sweep, 6.0);
      float ring = smoothstep(0.96, 0.985, r) * (1.0 - smoothstep(0.985, 1.0, r));
      float grid = (1.0 - smoothstep(0.0, 0.015, abs(fract(r * 4.0) - 0.5) - 0.48)) * 0.15;
      gl_FragColor = vec4(color * 1.6, opacity * (trail * 0.75 + ring * 0.9 + grid));
    }`,
}

function radar(effect: EffectInstance): EffectVisual {
  const { color, opacity, speed, padding } = effect.parameters
  const material = new ShaderMaterial({
    ...radarShader,
    uniforms: { color: { value: new Color(color) }, opacity: { value: opacity }, angle: { value: 0 } },
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    blending: AdditiveBlending,
  })
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute([-1, 0, -1, 1, 0, -1, 1, 0, 1, -1, 0, 1], 3))
  geometry.setAttribute('uv', new Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2))
  geometry.setIndex([0, 2, 1, 0, 3, 2])
  const mesh = new Mesh(geometry, material)
  return visual(mesh, ({ bounds, size, center, time }) => {
    mesh.position.set(center.x, bounds.min.y + 0.05, center.z)
    mesh.scale.setScalar(Math.max(size.x, size.z) / 2 + padding)
    material.uniforms.angle!.value = time * (speed || 0.5) * 2.2
  })
}

const wallShader = {
  vertexShader: /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform vec3 color; uniform float opacity; uniform float time;
    varying vec2 vUv;
    void main() {
      float fade = pow(1.0 - vUv.y, 1.4);
      float stripes = 0.5 + 0.5 * sin((vUv.y * 10.0 - time * 2.0) * 3.14159);
      gl_FragColor = vec4(color * 1.5, opacity * fade * (0.55 + 0.45 * stripes));
    }`,
}

function fence(effect: EffectInstance): EffectVisual {
  const { color, opacity, speed, padding, height } = effect.parameters
  const material = new ShaderMaterial({
    ...wallShader,
    uniforms: { color: { value: new Color(color) }, opacity: { value: opacity }, time: { value: 0 } },
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    blending: AdditiveBlending,
  })
  // Unit wall around a 1×1 square, open at top and bottom.
  const corners = [
    [-0.5, -0.5],
    [0.5, -0.5],
    [0.5, 0.5],
    [-0.5, 0.5],
    [-0.5, -0.5],
  ]
  const positions: number[] = []
  const uvs: number[] = []
  for (let i = 1; i < corners.length; i++) {
    const [ax, az] = corners[i - 1]!
    const [bx, bz] = corners[i]!
    positions.push(ax!, 0, az!, bx!, 0, bz!, bx!, 1, bz!, ax!, 0, az!, bx!, 1, bz!, ax!, 1, az!)
    uvs.push(0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1)
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2))
  const mesh = new Mesh(geometry, material)
  return visual(mesh, ({ bounds, size, center, time }) => {
    mesh.position.set(center.x, bounds.min.y, center.z)
    mesh.scale.set(size.x + padding * 2, height ?? Math.max(2, size.y * 0.6), size.z + padding * 2)
    material.uniforms.time!.value = time * (speed || 0.4)
  })
}

const beamShader = {
  vertexShader: /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform vec3 color; uniform float opacity; uniform float pulse;
    varying vec2 vUv;
    void main() {
      float fade = pow(1.0 - vUv.y, 1.8);
      float core = 1.0 - abs(vUv.x - 0.5) * 2.0;
      gl_FragColor = vec4(color * 2.0, opacity * fade * (0.35 + 0.65 * core) * pulse);
    }`,
}

function beam(effect: EffectInstance): EffectVisual {
  const { color, opacity, speed, height } = effect.parameters
  const material = new ShaderMaterial({
    ...beamShader,
    uniforms: { color: { value: new Color(color) }, opacity: { value: opacity }, pulse: { value: 1 } },
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    blending: AdditiveBlending,
  })
  const mesh = new Mesh(new CylinderGeometry(1, 1, 1, 32, 1, true).translate(0, 0.5, 0), material)
  return visual(mesh, ({ bounds, size, center, time }) => {
    const radius = Math.max(0.3, Math.min(size.x, size.z) * 0.3)
    mesh.position.set(center.x, bounds.max.y, center.z)
    mesh.scale.set(radius, height ?? 30, radius)
    material.uniforms.pulse!.value = speed === 0 ? 1 : 0.7 + 0.3 * Math.sin(time * speed * Math.PI)
  })
}

function floatingLabel(effect: EffectInstance): EffectVisual {
  const { color, opacity, text, padding, scale } = effect.parameters
  // Labels produced by alarm rules outrank everything else when labels collide.
  const sprite = new TextSprite(
    { lines: [text || ' '], style: 'tag', color, background: '#0d1219', size: scale ?? 1, opacity },
    effect.id.startsWith('rule:') ? 4 : 2,
  )
  return visual(sprite, ({ bounds, center }) => {
    sprite.position.set(center.x, bounds.max.y + padding + 0.2, center.z)
  })
}

function dataLabel(effect: EffectInstance): EffectVisual {
  const { color, opacity, text, padding, scale } = effect.parameters
  const sprite = new TextSprite(undefined, 2)
  return visual(sprite, ({ bounds, center, data }) => {
    sprite.position.set(center.x, bounds.max.y + padding + 0.2, center.z)
    const rows = data?.rows.length ? data.rows : ['暂无实时数据\t—']
    sprite.setContent({
      lines: [text || data?.title || '设备', ...rows],
      style: 'panel',
      color,
      background: '#0b1118',
      size: scale ?? 1,
      opacity,
    })
  })
}

function iconMarker(effect: EffectInstance): EffectVisual {
  const { color, text, speed, scale, height } = effect.parameters
  const sprite = new TextSprite(
    { lines: [text || '●'], style: 'pin', color, background: '#0d1219', size: scale ?? 1 },
    effect.id.startsWith('rule:') ? 4 : 2,
  )
  return visual(sprite, ({ bounds, center, time }) => {
    const bob = speed === 0 ? 0 : Math.sin(time * speed * 2.5) * 0.25
    sprite.position.set(center.x, bounds.max.y + (height ?? 2) + bob, center.z)
  })
}

const factories: Partial<Record<EffectInstance['kind'], (effect: EffectInstance) => EffectVisual>> = {
  'box-glow': boxGlow,
  'ground-pulse': groundPulse,
  ripple,
  radar,
  fence,
  beam,
  'floating-label': floatingLabel,
  'data-label': dataLabel,
  'icon-marker': iconMarker,
}

/** A helper object for an effect, or null for effects applied to the target itself (outline, highlight). */
export function createEffectVisual(effect: EffectInstance): EffectVisual | null {
  const factory = factories[effect.kind]
  if (!factory) return null
  const result = factory(effect)
  result.object.name = `Effect:${effect.id}`
  result.object.traverse(node => {
    node.userData.runtimeEffect = true
    node.userData.editorInternal = true
    node.raycast = () => {}
  })
  return result
}

export { sceneTime }
