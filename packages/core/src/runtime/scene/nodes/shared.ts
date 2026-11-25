/*
 * 各类节点共用的小工具：统一的动画时钟（流动、扫描效果保持同步）、释放节点自己创建的资源、表面图案（地砖、草坪、水面…）。
 */
import { PointLight, SpotLight, Line, Mesh, MeshStandardMaterial, type Object3D } from 'three'
import type { PrimitiveNodeV2 } from '../../../domain/scene'
import { flowSpeed, patternTextures } from '../surfacePatterns'
import { TextSprite } from '../textSprite'

/** Seconds on a clock shared by every animated node and effect, so flows stay in phase. */
export const sceneTime = (): number => performance.now() / 1000

/** Frees geometries, materials and textures owned by a node object (never shared model resources). */
export function disposeOwned(object: Object3D): void {
  object.traverse(node => {
    if (node instanceof PointLight || node instanceof SpotLight) node.dispose()
    else if (node instanceof TextSprite) node.dispose()
    else if (node instanceof Mesh || node instanceof Line) {
      node.geometry.dispose()
      for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
        disposePatternTextures(material as MeshStandardMaterial)
        material.dispose()
      }
    }
  })
}

export function disposePatternTextures(material: MeshStandardMaterial): void {
  for (const texture of [material.map, material.emissiveMap]) if (texture?.userData.ownedPattern) texture.dispose()
}

/** Sets a material's pattern textures; returns whether a pattern is drawn. */
export function applyPattern(
  material: MeshStandardMaterial,
  pattern: PrimitiveNodeV2['primitive']['pattern'],
  base: string,
  repeat: [number, number],
): boolean {
  const signature = pattern ? JSON.stringify([pattern, base, repeat]) : ''
  if (material.userData.patternSignature !== signature) {
    disposePatternTextures(material)
    const textures = pattern ? patternTextures(pattern, base, repeat) : null
    material.map = textures?.map ?? null
    material.emissiveMap = textures?.glow ?? null
    material.userData.patternSignature = signature
    material.userData.flow = textures ? flowSpeed(pattern?.kind) : 0
    material.needsUpdate = true
  }
  return material.map !== null
}

/** Scrolls flowing patterns (water) each frame. */
export function flowPattern(material: MeshStandardMaterial): void {
  const speed = material.userData.flow as number | undefined
  if (speed && material.map) material.map.offset.set(sceneTime() * speed, sceneTime() * speed * 0.35)
}
