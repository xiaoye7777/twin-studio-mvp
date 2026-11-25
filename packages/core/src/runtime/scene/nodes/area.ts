/*
 * 区域：地面上的多边形，可选半透明围墙（带扫描光）、表面图案和中央的名称牌。
 */
import {
  AdditiveBlending,
  BufferGeometry,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  Line,
  LineBasicMaterial,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  type Object3D,
  ShaderMaterial,
  Shape,
  ShapeGeometry,
  Vector2,
  Vector3,
} from 'three'
import type { AreaNodeV2 } from '../../../domain/scene'
import { TextSprite } from '../textSprite'
import { sceneTime, applyPattern, flowPattern } from './shared'

const wallShader = {
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform vec3 color; uniform float opacity; uniform float time;
    varying vec2 vUv;
    void main() {
      float fade = pow(1.0 - vUv.y, 1.6);
      float scan = smoothstep(0.0, 0.08, 0.08 - abs(fract(time * 0.35) - vUv.y)) * 0.8;
      gl_FragColor = vec4(color * (1.2 + scan * 2.0), opacity * (fade * 0.85 + scan * 0.6));
    }`,
}

export function createAreaObject(node: AreaNodeV2): Object3D {
  const { points: raw, color, opacity, wallHeight, label, pattern } = node.area
  const points = raw.map(([x, , z]) => new Vector3(x, 0, z))
  const group = new Group()
  const shape = new Shape(points.map(p => new Vector2(p.x, -p.z)))
  const geometry = new ShapeGeometry(shape).rotateX(-Math.PI / 2)
  let fill: Mesh
  // A patterned area is a lit surface (lawn, paving, water); a plain one a translucent zone overlay.
  const surface = new MeshStandardMaterial({
    side: DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  })
  if (pattern && applyPattern(surface, pattern, color, [1 / pattern.scale, 1 / pattern.scale])) {
    surface.transparent = opacity < 0.98
    surface.opacity = opacity
    surface.depthWrite = opacity >= 0.98
    surface.roughness = pattern.kind === 'water' ? 0.15 : 0.85
    if (surface.emissiveMap) {
      surface.emissive.set(pattern.color)
      surface.emissiveIntensity = 1.2
    }
    fill = new Mesh(geometry, surface)
    fill.onBeforeRender = () => flowPattern(surface)
  } else {
    surface.dispose()
    fill = new Mesh(
      geometry,
      new MeshBasicMaterial({
        color,
        transparent: true,
        opacity: opacity * 0.38,
        depthWrite: false,
        side: DoubleSide,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      }),
    )
  }
  fill.position.y = 0.04
  fill.receiveShadow = true
  group.add(fill)
  const outline = new BufferGeometry().setFromPoints([...points, points[0]!].map(p => p.clone().setY(0.08)))
  group.add(new Line(outline, new LineBasicMaterial({ color, transparent: true, opacity: Math.min(1, opacity + 0.3) })))
  if (wallHeight > 0) {
    const positions: number[] = []
    const uvs: number[] = []
    const closed = [...points, points[0]!]
    for (let i = 1; i < closed.length; i++) {
      const a = closed[i - 1]!
      const b = closed[i]!
      positions.push(
        a.x,
        0,
        a.z,
        b.x,
        0,
        b.z,
        b.x,
        wallHeight,
        b.z,
        a.x,
        0,
        a.z,
        b.x,
        wallHeight,
        b.z,
        a.x,
        wallHeight,
        a.z,
      )
      uvs.push(0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1)
    }
    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
    geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2))
    const material = new ShaderMaterial({
      ...wallShader,
      uniforms: { color: { value: new Color(color) }, opacity: { value: opacity }, time: { value: 0 } },
      transparent: true,
      depthWrite: false,
      side: DoubleSide,
      blending: AdditiveBlending,
    })
    const wall = new Mesh(geometry, material)
    wall.onBeforeRender = () => {
      material.uniforms.time!.value = sceneTime()
    }
    group.add(wall)
  }
  if (label.trim()) {
    const center = points.reduce((sum, p) => sum.add(p), new Vector3()).divideScalar(points.length)
    const sprite = new TextSprite({ lines: [label], style: 'title', color: '#ffffff', background: color, size: 1.1 }, 1)
    sprite.position.set(center.x, Math.max(1, wallHeight * 0.6), center.z)
    group.add(sprite)
  }
  return group
}
