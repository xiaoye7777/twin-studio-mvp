import type { Object3D } from 'three'

export interface AssetInstanceEditorMetadata {
  kind: 'assetInstance'
  assetRoot: true
  assetId: string
  instanceId: string
}

export function setEditorMetadata(object: Object3D, metadata: AssetInstanceEditorMetadata): void {
  object.userData.editor = metadata
}

export function getEditorMetadata(object: Object3D): AssetInstanceEditorMetadata | null {
  const value: unknown = object.userData.editor
  if (typeof value !== 'object' || value === null || !('kind' in value)) return null
  if (
    value.kind === 'assetInstance' &&
    'assetId' in value &&
    typeof value.assetId === 'string' &&
    'instanceId' in value &&
    typeof value.instanceId === 'string'
  )
    return value as AssetInstanceEditorMetadata
  return null
}

export function findAssetInstanceRoot(object: Object3D): Object3D | null {
  let current: Object3D | null = object
  while (current) {
    if (getEditorMetadata(current)) return current
    current = current.parent
  }
  return null
}
