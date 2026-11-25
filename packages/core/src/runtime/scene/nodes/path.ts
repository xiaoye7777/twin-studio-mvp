/*
 * 路径（能流线）：沿折线在地面上铺一条带子，用着色器画出流动的光；也可以是管道或虚线样式。
 */
import {
  BufferGeometry,
  Color,
  CurvePath,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  LineCurve3,
  Mesh,
  MeshStandardMaterial,
  type Object3D,
  ShaderMaterial,
  TubeGeometry,
  Vector3,
} from 'three'
import type { PathNodeV2 } from '../../../domain/scene'
import { sceneTime } from './shared'

const flowShader = {
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    #include <fog_pars_vertex>
    void main() {
      vUv = uv;
      vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
      gl_Position = projectionMatrix * mvPosition;
      #include <fog_vertex>
    }`,
  fragmentShader: /* glsl */ `
    uniform vec3 color; uniform float opacity; uniform float time; uniform float speed; uniform float repeat;
    uniform float ribbon;
    varying vec2 vUv;
    #include <fog_pars_fragment>
    void main() {
      float along = vUv.x * repeat - time * speed;
      float pulse = smoothstep(0.0, 0.55, fract(along)) * (1.0 - smoothstep(0.55, 0.62, fract(along)));
      float edge = ribbon > 0.5 ? 1.0 - smoothstep(0.35, 0.5, abs(vUv.y - 0.5)) : 1.0;
      vec3 base = color * 0.45;
      vec3 glow = color * (1.0 + pulse * 2.6);
      gl_FragColor = vec4(mix(base, glow, pulse), opacity * (0.55 + 0.45 * pulse) * edge);
      #include <fog_fragment>
    }`,
}

function polylineLength(points: readonly Vector3[]): number {
  let length = 0
  for (let i = 1; i < points.length; i++) length += points[i]!.distanceTo(points[i - 1]!)
  return length
}

/** A flat ribbon along a polyline on the ground, with uv.x running along its length. */
function ribbonGeometry(points: readonly Vector3[], width: number): BufferGeometry {
  const positions: number[] = []
  const uvs: number[] = []
  const indices: number[] = []
  const total = Math.max(polylineLength(points), 1e-6)
  let travelled = 0
  for (let i = 0; i < points.length; i++) {
    const current = points[i]!
    const previous = points[i - 1] ?? current
    const next = points[i + 1] ?? current
    const direction = next.clone().sub(previous).setY(0)
    if (direction.lengthSq() < 1e-9) direction.set(1, 0, 0)
    direction.normalize()
    const side = new Vector3(-direction.z, 0, direction.x).multiplyScalar(width / 2)
    if (i > 0) travelled += current.distanceTo(previous)
    positions.push(
      current.x + side.x,
      current.y + 0.03,
      current.z + side.z,
      current.x - side.x,
      current.y + 0.03,
      current.z - side.z,
    )
    uvs.push(travelled / total, 0, travelled / total, 1)
    if (i > 0) {
      const a = (i - 1) * 2
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
    }
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}

export function createPathObject(node: PathNodeV2): Object3D {
  const { points: raw, closed, style, color, width, speed, opacity } = node.path
  const points = raw.map(point => new Vector3(...point))
  if (closed && points.length > 2) points.push(points[0]!.clone())
  const group = new Group()
  const length = polylineLength(points)
  if (style === 'tube' || style === 'flow') {
    const curve = new CurvePath<Vector3>()
    for (let i = 1; i < points.length; i++) curve.add(new LineCurve3(points[i - 1]!, points[i]!))
    const geometry = new TubeGeometry(
      curve,
      Math.max(8, Math.min(2000, (points.length - 1) * 24)),
      width / 2,
      10,
      false,
    )
    if (style === 'tube') {
      const mesh = new Mesh(
        geometry,
        new MeshStandardMaterial({ color, metalness: 0.55, roughness: 0.35, transparent: opacity < 1, opacity }),
      )
      mesh.castShadow = true
      mesh.receiveShadow = true
      group.add(mesh)
      return group
    }
    const material = new ShaderMaterial({
      ...flowShader,
      uniforms: {
        color: { value: new Color(color) },
        opacity: { value: opacity },
        time: { value: 0 },
        speed: { value: speed * 0.5 },
        repeat: { value: Math.max(1, length / Math.max(width * 8, 2)) },
        ribbon: { value: 0 },
        fogColor: { value: new Color() },
        fogDensity: { value: 0 },
        fogNear: { value: 1 },
        fogFar: { value: 2000 },
      },
      transparent: true,
      depthWrite: false,
      fog: true,
    })
    const mesh = new Mesh(geometry, material)
    mesh.onBeforeRender = () => {
      material.uniforms.time!.value = sceneTime()
    }
    group.add(mesh)
    return group
  }
  const material = new ShaderMaterial({
    ...flowShader,
    uniforms: {
      color: { value: new Color(color) },
      opacity: { value: opacity },
      time: { value: 0 },
      speed: { value: speed * 0.5 },
      repeat: { value: Math.max(1, length / Math.max(width * 4, 1)) },
      ribbon: { value: 1 },
      fogColor: { value: new Color() },
      fogDensity: { value: 0 },
      fogNear: { value: 1 },
      fogFar: { value: 2000 },
    },
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    fog: true,
  })
  const mesh = new Mesh(ribbonGeometry(points, width), material)
  mesh.onBeforeRender = () => {
    material.uniforms.time!.value = sceneTime()
  }
  group.add(mesh)
  return group
}
