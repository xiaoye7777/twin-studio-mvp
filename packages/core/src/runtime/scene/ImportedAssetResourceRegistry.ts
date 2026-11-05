import type { AssetRecord } from '../../infrastructure/assets/AssetRepository'

export interface ImportedAssetResource {
  assetId: string
  objectUrl: string
  displayName: string
}

export class ImportedAssetResourceRegistry {
  private readonly resources = new Map<string, ImportedAssetResource>()

  getOrCreate(asset: AssetRecord): ImportedAssetResource {
    const existing = this.resources.get(asset.id)
    if (existing) return existing

    const resource: ImportedAssetResource = {
      assetId: asset.id,
      objectUrl: URL.createObjectURL(asset.blob),
      displayName: asset.name.replace(/\.glb$/i, '') || 'Imported Model',
    }
    this.resources.set(asset.id, resource)
    return resource
  }

  dispose(): void {
    for (const resource of this.resources.values()) {
      URL.revokeObjectURL(resource.objectUrl)
    }
    this.resources.clear()
  }
}
