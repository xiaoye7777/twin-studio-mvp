/*
 * Viewer 用的只读资源仓库：场景 JSON 里只有资源 ID，文件地址由宿主告诉我们。
 * 宿主返回 URL 时这里去下载；返回 Blob 时直接用（需要带登录信息下载时，宿主自己下载好再给）。
 */
import type { AssetMetadata, AssetRecord, AssetRepository, AssetType } from './AssetRepository'

/** 资源 ID → 文件。 */
export type AssetResolver = (assetId: string) => string | Blob | Promise<string | Blob>

export class UrlAssetRepository implements AssetRepository {
  private readonly cache = new Map<string, Promise<AssetRecord | null>>()

  constructor(
    private readonly resolve: AssetResolver,
    private readonly options: { signal?: AbortSignal; typeOf?: (assetId: string) => AssetType } = {},
  ) {}

  get(assetId: string): Promise<AssetRecord | null> {
    let pending = this.cache.get(assetId)
    if (!pending) {
      pending = this.fetchRecord(assetId)
      this.cache.set(assetId, pending)
      pending.catch(() => this.cache.delete(assetId))
    }
    return pending
  }

  private async fetchRecord(assetId: string): Promise<AssetRecord> {
    const source = await this.resolve(assetId)
    const blob = typeof source === 'string' ? await this.download(assetId, source) : source
    return {
      id: assetId,
      fingerprint: assetId,
      name: assetId,
      mimeType: blob.type,
      size: blob.size,
      lastModified: 0,
      blob,
      createdAt: '',
      assetType: this.options.typeOf?.(assetId) ?? 'model',
    }
  }

  private async download(assetId: string, url: string): Promise<Blob> {
    const response = await fetch(url, { signal: this.options.signal })
    if (!response.ok) throw new Error(`资源 ${assetId} 下载失败（HTTP ${response.status}）`)
    return response.blob()
  }

  saveFile(): Promise<AssetRecord> {
    return Promise.reject(new Error('Viewer 不能上传资源'))
  }

  listMetadata(): Promise<AssetMetadata[]> {
    return Promise.resolve([])
  }
}
