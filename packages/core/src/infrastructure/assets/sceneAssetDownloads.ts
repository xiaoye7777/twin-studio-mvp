import type { SceneDocumentV2 } from '../../domain/scene'
import type { AssetResolver } from './UrlAssetRepository'

/** Business API settings only. Headers must never be forwarded to signed download URLs. */
export interface ViewerAssetApi {
  assetsUrl?: string
  fileUrlsUrl?: string
  headers?: Record<string, string>
}

interface AssetLink {
  id: string | number
  fileId?: string | number
  downloadUrl?: string
}

interface FileLink {
  fileId: string | number
  downloadUrl: string
}

async function getRows<T>(
  endpoint: string,
  ids: Set<string>,
  headers: ViewerAssetApi['headers'],
  signal: AbortSignal,
): Promise<T[]> {
  const rows: T[] = []
  const keys = [...ids]
  // Keep the query comfortably below typical proxy URL limits for UUIDs.
  for (let start = 0; start < keys.length; start += 64) {
    const url = new URL(endpoint, window.location.href)
    for (const id of keys.slice(start, start + 64)) url.searchParams.append('ids', id)
    const response = await fetch(url, { headers, signal, cache: 'no-store' })
    if (!response.ok) throw new Error(`获取场景资源地址失败（HTTP ${response.status}）`)
    const body = await response.json()
    if (body.code !== 0 || !Array.isArray(body.data)) throw new Error(body.msg || '场景资源接口未返回有效列表')
    rows.push(...body.data)
  }
  return rows
}

/** Resolve all scene-local IDs once for this load, before SceneSync starts downloading. */
export async function prepareSceneAssets(
  scene: SceneDocumentV2,
  api: ViewerAssetApi = {},
  signal: AbortSignal,
): Promise<AssetResolver> {
  const assetIds = new Set<string>()
  for (const node of scene.nodes) if (node.kind === 'model') assetIds.add(node.model.assetId)
  const sky = scene.settings.sky
  if (sky.mode === 'hdr' && sky.hdrAssetId) assetIds.add(sky.hdrAssetId)

  const assetsUrl = api.assetsUrl ?? '/api/v1/assets/by-ids'
  const fileUrlsUrl = api.fileUrlsUrl ?? '/api/v1/files/download-urls'
  const assets = await getRows<AssetLink>(assetsUrl, assetIds, api.headers, signal)
  const files = new Map<string, string>()
  const downloads = new Map<string, string>()
  for (const asset of assets) {
    const id = String(asset.id)
    if (!assetIds.has(id)) continue
    if (asset.downloadUrl) downloads.set(id, new URL(asset.downloadUrl, new URL(assetsUrl, window.location.href)).href)
    else if (asset.fileId != null) files.set(id, String(asset.fileId))
  }

  const links = await getRows<FileLink>(fileUrlsUrl, new Set(files.values()), api.headers, signal)
  const byFile = new Map(links.map(link => [String(link.fileId), link.downloadUrl]))
  for (const [id, fileId] of files) {
    const url = byFile.get(fileId)
    if (url) downloads.set(id, new URL(url, new URL(fileUrlsUrl, window.location.href)).href)
  }
  return id => {
    const url = downloads.get(id)
    if (!url) throw new Error(`资源 ${id} 缺少下载地址`)
    return url
  }
}
