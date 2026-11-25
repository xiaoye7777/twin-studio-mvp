import { Color, Mesh, type Object3D, type Material, type MeshStandardMaterial, type Texture } from 'three'
import type { ModelMaterial } from '../../domain/scene'

type Look = Partial<
  Pick<MeshStandardMaterial, 'color' | 'emissive' | 'emissiveIntensity' | 'metalness' | 'roughness'>
> & {
  map?: Texture | null
}

/**
 * Sets `target` (a copy of `source`) to `source` with a part's material override on top. Works with any
 * material type: properties a material does not have are skipped.
 */
function applyModelMaterial(target: Material, source: Material, look: ModelMaterial): void {
  const to = target as Material & Look
  const from = source as Material & Look
  if (to.color instanceof Color && from.color instanceof Color) {
    to.color.copy(from.color)
    if (look.color) to.color.set(look.color)
  }
  if ('map' in to) {
    const map = look.texture === false ? null : (from.map ?? null)
    if (to.map !== map) {
      to.map = map
      target.needsUpdate = true
    }
  }
  const fading = look.opacity !== undefined && look.opacity < 1
  const transparent = source.transparent || fading
  if (target.transparent !== transparent) {
    target.transparent = transparent
    target.needsUpdate = true
  }
  target.opacity = source.opacity * (look.opacity ?? 1)
  // See-through shells must not hide what is inside them.
  target.depthWrite = fading ? false : source.depthWrite
  if (typeof to.metalness === 'number') to.metalness = look.metalness ?? from.metalness ?? to.metalness
  if (typeof to.roughness === 'number') to.roughness = look.roughness ?? from.roughness ?? to.roughness
  if (to.emissive instanceof Color && from.emissive instanceof Color) {
    to.emissive.copy(from.emissive)
    to.emissiveIntensity = from.emissiveIntensity ?? 1
    if (look.emissive) {
      to.emissive.set(look.emissive)
      to.emissiveIntensity = look.emissiveIntensity ?? 1
    }
  }
}

/** One GLB instance. Original materials and textures belong to the shared model loader. */
export class ModelMaterials {
  private readonly originals = new Map<Mesh, Material | Material[]>()
  private readonly copies = new Map<Material, Material>()

  constructor(root: Object3D) {
    root.traverse(node => {
      if (node instanceof Mesh) this.originals.set(node, node.material)
    })
  }

  baseLook() {
    const materials = [...this.originals.values()].flat() as Array<Material & Look>
    const first = materials[0]
    return {
      color: '#' + (first?.color?.getHexString() ?? 'ffffff'),
      texture: materials.some(material => material.map),
      metalness: first?.metalness ?? 0,
      roughness: first?.roughness ?? 1,
      emissive: '#' + (first?.emissive?.getHexString() ?? '000000'),
    }
  }

  apply(look?: ModelMaterial): void {
    if (!look || !Object.keys(look).length) {
      for (const [mesh, original] of this.originals) mesh.material = original
      this.dispose()
      return
    }
    // Reassign the instance material even when a temporary highlight currently covers it.
    const updated = new Set<Material>()
    const copyOf = (source: Material) => {
      let copy = this.copies.get(source)
      if (!copy) {
        copy = source.clone()
        this.copies.set(source, copy)
      }
      if (!updated.has(source)) {
        applyModelMaterial(copy, source, look)
        updated.add(source)
      }
      return copy
    }
    for (const [mesh, original] of this.originals)
      mesh.material = Array.isArray(original) ? original.map(copyOf) : copyOf(original)
  }

  dispose(): void {
    for (const material of this.copies.values()) material.dispose()
    this.copies.clear()
  }
}
