import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createEmptyDocument, identityTransform } from '../src/document/sceneOps'
import { prepareSceneAssets } from '../src/infrastructure/assets/sceneAssetDownloads'
import { UrlAssetRepository } from '../src/infrastructure/assets/UrlAssetRepository'

function sceneWith(...ids: string[]) {
  const scene = createEmptyDocument('project', '测试')
  scene.nodes = ids.map((assetId, i) => ({
    id: String(i),
    name: assetId,
    kind: 'model',
    visible: true,
    locked: false,
    parentId: null,
    transform: identityTransform(),
    model: { assetId },
  }))
  return scene
}

const ok = (data: unknown) => Response.json({ code: 0, data })
const signal = new AbortController().signal
beforeEach(() => vi.stubGlobal('window', { location: { href: 'https://screen.example/project' } }))
afterEach(() => vi.unstubAllGlobals())

describe('automatic scene asset downloads', () => {
  it('batches unique resources and file IDs, joins unordered results, and limits credentials to the API', async () => {
    const scene = sceneWith('cabinet', 'pump', 'cabinet', 'other', 'missing')
    scene.settings.sky = { ...scene.settings.sky, mode: 'hdr', hdrAssetId: 'sky' }
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(
        ok([
          { id: 'other', fileId: 143 },
          { id: 'pump', fileId: 201 },
          { id: 'sky', downloadUrl: 'https://storage.example/sky' },
          { id: 'cabinet', fileId: 143 },
        ]),
      )
      .mockResolvedValueOnce(
        ok([
          { fileId: 201, downloadUrl: '/pump' },
          { fileId: 143, downloadUrl: 'https://storage.example/cab?sig=123' },
        ]),
      )
      .mockResolvedValueOnce(new Response('glb'))
    vi.stubGlobal('fetch', fetch)
    const headers = { Authorization: 'Bearer test', 'tenant-id': '1' }
    const options = { assetsUrl: '/custom/assets', fileUrlsUrl: 'https://backend.example/custom/files', headers }
    const resolve = await prepareSceneAssets(scene, options, signal)
    const [assets, files] = fetch.mock.calls
    expect(String(assets![0])).toBe(
      'https://screen.example/custom/assets?ids=cabinet&ids=pump&ids=other&ids=missing&ids=sky',
    )
    expect(String(files![0])).toBe('https://backend.example/custom/files?ids=143&ids=201')
    expect(assets![1]).toMatchObject({ headers, signal })
    expect(files![1]).toMatchObject({ headers, signal })
    expect(resolve('sky')).toBe('https://storage.example/sky')
    expect(resolve('pump')).toBe('https://backend.example/pump')
    expect(resolve('other')).toBe(resolve('cabinet'))
    expect(() => resolve('missing')).toThrow('missing')
    const repository = new UrlAssetRepository(resolve, { signal })
    await Promise.all([repository.get('cabinet'), repository.get('cabinet')])
    expect(fetch.mock.calls.slice(2)).toEqual([['https://storage.example/cab?sig=123', { signal }]])
  })
  it('avoids lookups for an empty scene and skips signing assets with direct URLs', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(ok([{ id: 314, downloadUrl: '/models/box' }]))
    vi.stubGlobal('fetch', fetch)
    const empty = sceneWith()
    empty.settings.sky.hdrAssetId = 'inactive'
    await prepareSceneAssets(empty, {}, signal)
    expect(fetch).not.toHaveBeenCalled()
    const resolve = await prepareSceneAssets(sceneWith('314'), {}, signal)
    expect(resolve('314')).toBe('https://screen.example/models/box')
    expect(fetch).toHaveBeenCalledTimes(1)
  })
  it('reports HTTP and business errors while preparing URLs', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(new Response('', { status: 401 }))
        .mockResolvedValueOnce(Response.json({ code: 400, msg: '文件查询失败' })),
    )
    await expect(prepareSceneAssets(sceneWith('a'), {}, signal)).rejects.toThrow('401')
    await expect(prepareSceneAssets(sceneWith('a'), {}, signal)).rejects.toThrow('文件查询失败')
  })
})
