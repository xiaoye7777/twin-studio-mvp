import { afterEach, describe, expect, it, vi } from 'vitest'
import { UrlAssetRepository } from '../src/infrastructure/assets/UrlAssetRepository'

afterEach(() => vi.unstubAllGlobals())

describe('UrlAssetRepository', () => {
  it('downloads a resolved URL once per asset', async () => {
    const fetch = vi.fn(async (_url: string, _init?: RequestInit) => new Response(new Blob(['glb'])))
    vi.stubGlobal('fetch', fetch)
    const resolve = vi.fn((id: string) => `/files/${id}`)
    const assets = new UrlAssetRepository(resolve)
    const [first] = await Promise.all([assets.get('a'), assets.get('a')])
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(fetch).toHaveBeenCalledWith('/files/a', { signal: undefined })
    expect(first).toMatchObject({ id: 'a', assetType: 'model', size: 3 })
  })

  it('uses a Blob from the host without downloading', async () => {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    const blob = new Blob(['hdr'])
    const assets = new UrlAssetRepository(async () => blob, { typeOf: () => 'environment' })
    expect(await assets.get('sky')).toMatchObject({ blob, assetType: 'environment' })
    expect(fetch).not.toHaveBeenCalled()
  })

  it('reports a failed download and can retry', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('', { status: 404 })),
    )
    const assets = new UrlAssetRepository(id => `/files/${id}`)
    await expect(assets.get('a')).rejects.toThrow('404')
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(new Blob(['glb']))),
    )
    await expect(assets.get('a')).resolves.toMatchObject({ id: 'a' })
  })
})
