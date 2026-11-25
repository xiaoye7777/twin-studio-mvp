/*
 * 基本体：立方体、平面、圆柱、球体、圆锥。可以带表面图案（地砖、草坪、水面……）。
 */
import {
  BoxGeometry,
  BufferGeometry,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  SphereGeometry,
} from 'three'
import type { PrimitiveNodeV2, PrimitiveShape } from '../../../domain/scene'
import { applyPattern, flowPattern } from './shared'

export const primitiveDefaults: Record<PrimitiveShape, PrimitiveNodeV2['primitive']> = {
  box: { shape: 'box', color: '#8a97a8', width: 4, height: 3, depth: 4 },
  plane: { shape: 'plane', color: '#59626c', width: 20, height: 20 },
  cylinder: { shape: 'cylinder', color: '#7fa3b8', radiusTop: 1.5, radiusBottom: 1.5, height: 4, radialSegments: 32 },
  sphere: { shape: 'sphere', color: '#9fb4c7', radiusTop: 2 },
  cone: { shape: 'cone', color: '#c08a5b', radiusBottom: 2, height: 4, radialSegments: 32 },
}

export function primitiveGeometry(primitive: PrimitiveNodeV2['primitive']): BufferGeometry {
  const d = primitiveDefaults[primitive.shape]
  const height = primitive.height ?? d.height ?? 1
  const segments = Math.max(3, Math.min(128, Math.round(primitive.radialSegments ?? d.radialSegments ?? 32)))
  let geometry: BufferGeometry
  switch (primitive.shape) {
    case 'plane':
      geometry = new PlaneGeometry(primitive.width ?? d.width, primitive.height ?? d.height).rotateX(-Math.PI / 2)
      break
    case 'cylinder':
      geometry = new CylinderGeometry(
        primitive.radiusTop ?? d.radiusTop,
        primitive.radiusBottom ?? d.radiusBottom,
        height,
        segments,
      ).translate(0, height / 2, 0)
      break
    case 'sphere': {
      const radius = primitive.radiusTop ?? d.radiusTop ?? 1
      geometry = new SphereGeometry(radius, 48, 24).translate(0, radius, 0)
      break
    }
    case 'cone':
      geometry = new ConeGeometry(primitive.radiusBottom ?? d.radiusBottom, height, segments).translate(
        0,
        height / 2,
        0,
      )
      break
    default:
      geometry = new BoxGeometry(primitive.width ?? d.width, height, primitive.depth ?? d.depth).translate(
        0,
        height / 2,
        0,
      )
  }
  return geometry
}

/** How many pattern repeats fit across a primitive's main faces. */
function patternRepeat(primitive: PrimitiveNodeV2['primitive'], scale: number): [number, number] {
  const d = primitiveDefaults[primitive.shape]
  const width = primitive.width ?? d.width ?? 1
  const height = primitive.height ?? d.height ?? 1
  const radius = primitive.radiusBottom ?? primitive.radiusTop ?? d.radiusBottom ?? d.radiusTop ?? 1
  const across: Record<PrimitiveShape, [number, number]> = {
    plane: [width, height],
    box: [width, primitive.depth ?? d.depth ?? 1],
    cylinder: [Math.PI * 2 * radius, height],
    cone: [Math.PI * 2 * radius, height],
    sphere: [Math.PI * 2 * radius, Math.PI * radius],
  }
  const [u, v] = across[primitive.shape]
  return [Math.max(0.01, u / scale), Math.max(0.01, v / scale)]
}

export function applyPrimitiveMaterial(material: MeshStandardMaterial, primitive: PrimitiveNodeV2['primitive']): void {
  const pattern = primitive.pattern
  const patterned = applyPattern(
    material,
    pattern,
    primitive.color,
    pattern ? patternRepeat(primitive, pattern.scale) : [1, 1],
  )
  // A pattern's colours are drawn into its map.
  material.color.set(patterned ? '#ffffff' : primitive.color)
  const opacity = primitive.opacity ?? 1
  material.transparent = opacity < 1
  material.opacity = opacity
  material.depthWrite = opacity >= 0.98
  const glowing = patterned && material.emissiveMap !== null
  material.emissive.set(glowing ? pattern!.color : primitive.color)
  material.emissiveIntensity = glowing ? 0.6 + (primitive.emissive ?? 0) * 2.5 : (primitive.emissive ?? 0) * 2.5
  material.metalness = primitive.metalness ?? 0.1
  material.roughness = primitive.roughness ?? (pattern?.kind === 'water' ? 0.15 : 0.6)
  material.side = primitive.shape === 'plane' ? DoubleSide : material.side
  material.needsUpdate = true
}

export function createPrimitiveObject(node: PrimitiveNodeV2): Mesh {
  const material = new MeshStandardMaterial()
  applyPrimitiveMaterial(material, node.primitive)
  const mesh = new Mesh(primitiveGeometry(node.primitive), material)
  mesh.onBeforeRender = () => flowPattern(material)
  mesh.castShadow = node.primitive.shape !== 'plane'
  mesh.receiveShadow = true
  return mesh
}
