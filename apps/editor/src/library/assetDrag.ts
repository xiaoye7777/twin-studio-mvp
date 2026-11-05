/** 从资源栏拖进视口时带的数据。 */
export const ASSET_DRAG_MIME = 'application/x-twin-studio-asset'

export type AssetDragPayload = { type: 'asset'; assetId: string; name: string } | { type: 'builtin'; modelKey: string }

export function writeAssetDrag(dataTransfer: DataTransfer, payload: AssetDragPayload): void {
  dataTransfer.effectAllowed = 'copy'
  dataTransfer.setData(ASSET_DRAG_MIME, JSON.stringify(payload))
}

export function readAssetDrag(dataTransfer: DataTransfer | null): AssetDragPayload | null {
  const raw = dataTransfer?.getData(ASSET_DRAG_MIME)
  if (!raw) return null
  try {
    return JSON.parse(raw) as AssetDragPayload
  } catch {
    return null
  }
}
