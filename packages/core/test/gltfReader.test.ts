import { describe, expect, it } from 'vitest'
import { gltfExtensionsUsed } from '../src/engine/gltfReader'

/** A .glb with the given JSON chunk (padded to 4 bytes) and no binary chunk. */
function glb(json: object): ArrayBuffer {
  const text = new TextEncoder().encode(JSON.stringify(json))
  const padded = new Uint8Array(Math.ceil(text.length / 4) * 4).fill(0x20)
  padded.set(text)
  const data = new ArrayBuffer(20 + padded.length)
  const view = new DataView(data)
  view.setUint32(0, 0x46546c67, true)
  view.setUint32(4, 2, true)
  view.setUint32(8, data.byteLength, true)
  view.setUint32(12, padded.length, true)
  view.setUint32(16, 0x4e4f534a, true)
  new Uint8Array(data, 20).set(padded)
  return data
}

describe('gltfExtensionsUsed', () => {
  it('reads the extensions of a binary glTF', () => {
    const used = ['KHR_draco_mesh_compression', 'KHR_texture_basisu']
    expect(gltfExtensionsUsed(glb({ asset: { version: '2.0' }, extensionsUsed: used }))).toEqual(used)
  })

  it('reads JSON glTF and tolerates files without extensions', () => {
    const json = new TextEncoder().encode(JSON.stringify({ extensionsUsed: ['EXT_meshopt_compression'] }))
    expect(gltfExtensionsUsed(json.buffer)).toEqual(['EXT_meshopt_compression'])
    expect(gltfExtensionsUsed(glb({ asset: { version: '2.0' } }))).toEqual([])
  })

  it('returns nothing for damaged files, leaving the error to the loader', () => {
    const damaged = glb({ extensionsUsed: ['x'] })
    new DataView(damaged).setUint32(12, 1e6, true)
    expect(gltfExtensionsUsed(damaged)).toEqual([])
    expect(gltfExtensionsUsed(new ArrayBuffer(3))).toEqual([])
  })
})
