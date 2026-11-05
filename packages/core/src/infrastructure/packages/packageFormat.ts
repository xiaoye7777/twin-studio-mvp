import { z } from 'zod'
import type { SceneDocument } from '../../domain/scene'
import { nonEmptyString, trimmedString } from '../../domain/schemaHelpers'
import type { AssetType } from '../assets/AssetRepository'

export const PACKAGE_FORMAT = 'twin-studio-project'
export const PACKAGE_VERSION = 1
export const PACKAGE_LIMITS = {
  zipBytes: 256 * 1024 ** 2,
  totalBytes: 256 * 1024 ** 2,
  fileBytes: 128 * 1024 ** 2,
  jsonBytes: 8 * 1024 ** 2,
  files: 512,
}

const isoDate = z.string().refine(value => Number.isFinite(Date.parse(value)), { message: '不是有效的日期时间' })
const sha256Hex = z.string().regex(/^[a-f0-9]{64}$/, { message: '不是有效的 SHA-256' })

export const PackageAssetSchema = z.object({
  id: nonEmptyString,
  path: z.string().regex(/^assets\/[0-9]+\.(glb|hdr)$/),
  name: z
    .string()
    .min(1)
    .max(255)
    // eslint-disable-next-line no-control-regex -- asset names must not smuggle separators or control characters
    .refine(name => !/[\\/\x00-\x1f]/.test(name), { message: '文件名包含非法字符' }),
  mimeType: z.string(),
  assetType: z.enum(['model', 'environment']),
  size: z.int().positive().max(PACKAGE_LIMITS.fileBytes),
  sha256: sha256Hex,
  lastModified: z.number(),
  createdAt: isoDate,
})

const PackageHeaderSchema = z.object({
  exportedAt: z.string().optional(),
  project: z.object({
    id: nonEmptyString,
    name: trimmedString.pipe(z.string().max(200)),
    createdAt: isoDate,
    updatedAt: isoDate,
  }),
  scene: z.object({ path: z.literal('scene.json'), sha256: sha256Hex }),
  assets: z.array(z.unknown()),
})

export const PackageManifestSchema = PackageHeaderSchema.extend({
  format: z.literal(PACKAGE_FORMAT),
  packageVersion: z.literal(PACKAGE_VERSION),
  assets: z.array(PackageAssetSchema),
})

export type PackageAsset = z.infer<typeof PackageAssetSchema>
export type PackageManifest = z.infer<typeof PackageManifestSchema>

/** 场景依赖哪些资产文件。 */
export function collectSceneAssets(scene: SceneDocument): Map<string, AssetType> {
  const result = new Map<string, AssetType>()
  for (const node of scene.nodes) if (node.kind === 'model') result.set(node.model.assetId, 'model')
  const environment = scene.settings.sky.mode === 'hdr' ? scene.settings.sky.hdrAssetId : null
  if (environment) {
    if (result.has(environment)) throw new Error('同一资产不能同时作为模型和环境')
    result.set(environment, 'environment')
  }
  return result
}

export async function sha256(bytes: Uint8Array): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', new Uint8Array(bytes).buffer)
  return [...new Uint8Array(hash)].map(byte => byte.toString(16).padStart(2, '0')).join('')
}

export function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
export function json(bytes: Uint8Array | undefined, label: string): unknown {
  if (!bytes || bytes.length > PACKAGE_LIMITS.jsonBytes) throw new Error(`${label} 缺失或超过大小限制`)
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
  } catch {
    throw new Error(`${label} 不是有效 JSON`)
  }
}

/** Staged so each failure keeps its established, user-facing message. */
export function validateManifest(value: unknown): asserts value is PackageManifest {
  if (!record(value) || value.format !== PACKAGE_FORMAT) throw new Error('不是 Twin Studio 项目包')
  if (value.packageVersion !== PACKAGE_VERSION)
    throw new Error(`不支持的 packageVersion: ${String(value.packageVersion)}`)
  const header = PackageHeaderSchema.safeParse(value)
  if (!header.success) throw new Error('manifest 项目或场景信息无效')
  const ids = new Set<string>(),
    paths = new Set<string>()
  for (const item of header.data.assets) {
    const parsed = PackageAssetSchema.safeParse(item)
    if (!parsed.success) throw new Error('manifest 资产信息无效')
    const asset = parsed.data
    const extension = asset.assetType === 'model' ? '.glb' : '.hdr'
    if (
      !asset.path.endsWith(extension) ||
      !asset.name.toLowerCase().endsWith(extension) ||
      asset.mimeType !== (asset.assetType === 'model' ? 'model/gltf-binary' : 'image/vnd.radiance')
    )
      throw new Error('资产文件类型不匹配')
    if (ids.has(asset.id) || paths.has(asset.path)) throw new Error('manifest 包含重复资产')
    ids.add(asset.id)
    paths.add(asset.path)
  }
}
