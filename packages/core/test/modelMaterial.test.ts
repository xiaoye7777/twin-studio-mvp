import { Group, Mesh, MeshStandardMaterial, Texture } from 'three'
import { expect, it, vi } from 'vitest'
import { ModelMaterials } from '../src/runtime/scene/modelMaterial'

it('isolates an instance, updates all its material slots, and restores shared materials and textures', () => {
  const source = new MeshStandardMaterial({ color: '#884422', map: new Texture(), roughness: 0.6 })
  const second = new MeshStandardMaterial({ color: '#008877' })
  const slots = [second, source]
  const mesh = new Mesh(undefined, slots)
  const repeated = new Mesh(undefined, source)
  const sibling = new Mesh(undefined, source)
  const materials = new ModelMaterials(new Group().add(mesh, repeated))
  expect(materials.baseLook().texture).toBe(true)
  materials.apply({ opacity: 0.35, texture: false, emissive: '#00ff00', emissiveIntensity: 2 })
  const copy = repeated.material
  expect(copy).toBe(mesh.material[1])
  expect(copy).not.toBe(source)
  expect(mesh.material[0]!.opacity).toBe(0.35)
  expect(copy.map).toBeNull()
  expect(copy.emissiveIntensity).toBe(2)
  expect(sibling.material.opacity).toBe(1)
  materials.apply({ metalness: 0.9 })
  expect(copy.map).toBe(source.map)
  expect(copy.emissive.getHex()).toBe(0)
  expect(copy.metalness).toBe(0.9)
  const release = vi.spyOn(copy, 'dispose')
  const releaseTexture = vi.spyOn(source.map!, 'dispose')
  materials.apply()
  materials.dispose()
  expect(mesh.material).toBe(slots)
  expect(repeated.material).toBe(source)
  expect(release).toHaveBeenCalledOnce()
  expect(releaseTexture).not.toHaveBeenCalled()
})
