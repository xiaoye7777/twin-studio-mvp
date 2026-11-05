/*
 * 导出 .twin.zip 项目包：Viewer SDK 加载的就是它。
 * 包里是最近一次保存的场景，加上它引用的模型文件。
 */
import {
  collectSceneAssets,
  PACKAGE_FORMAT,
  PACKAGE_LIMITS,
  PACKAGE_VERSION,
  type PackageManifest,
  sha256,
  validateManifest,
  validatePortableAsset,
  writePackageZip,
} from '@twin-studio/core'
import type { ProjectInfo } from './adapter'
import { assetRepository, HttpSceneRepository } from './repositories'

export async function exportProjectPackage(project: ProjectInfo): Promise<Blob> {
  const scene = await new HttpSceneRepository().load(project.id)
  if (!scene) throw new Error('项目尚未保存场景，请先进入编辑器保存')
  const encode = (value: unknown) => new TextEncoder().encode(JSON.stringify(value))
  const sceneBytes = encode(scene)
  if (sceneBytes.length > PACKAGE_LIMITS.jsonBytes) throw new Error('场景 JSON 超过大小限制')
  const files: Record<string, Uint8Array> = { 'scene.json': sceneBytes }
  const manifest: PackageManifest = {
    format: PACKAGE_FORMAT,
    packageVersion: PACKAGE_VERSION,
    exportedAt: new Date().toISOString(),
    project: { id: project.id, name: project.name, createdAt: project.createdAt, updatedAt: project.updatedAt },
    scene: { path: 'scene.json', sha256: await sha256(sceneBytes) },
    assets: [],
  }
  let total = sceneBytes.length
  const dependencies = collectSceneAssets(scene)
  if (dependencies.size + 2 > PACKAGE_LIMITS.files) throw new Error('资产数量超过项目包限制')
  for (const [id, type] of dependencies) {
    const asset = await assetRepository.get(id)
    if (!asset || asset.assetType !== type) throw new Error(`缺少资产或类型不匹配: ${id}`)
    total += asset.blob.size
    if (asset.blob.size > PACKAGE_LIMITS.fileBytes || total > PACKAGE_LIMITS.totalBytes)
      throw new Error('项目资产超过项目包大小限制')
    const bytes = new Uint8Array(await asset.blob.arrayBuffer())
    validatePortableAsset(bytes, type)
    const path = `assets/${manifest.assets.length}.${type === 'model' ? 'glb' : 'hdr'}`
    files[path] = bytes
    manifest.assets.push({
      id,
      path,
      name: asset.name,
      mimeType: type === 'model' ? 'model/gltf-binary' : 'image/vnd.radiance',
      assetType: type,
      size: bytes.length,
      sha256: await sha256(bytes),
      lastModified: asset.lastModified,
      createdAt: asset.createdAt,
    })
  }
  validateManifest(manifest)
  files['manifest.json'] = encode(manifest)
  return writePackageZip(files)
}

/** 把项目包存到本地。 */
export async function downloadProjectPackage(project: ProjectInfo): Promise<void> {
  const blob = await exportProjectPackage(project)
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  // 文件名里不能有控制字符和路径分隔符。
  // eslint-disable-next-line no-control-regex
  link.download = `${project.name.replace(/[\\/:*?"<>|\x00-\x1f]/g, '_').slice(0, 100) || 'project'}.twin.zip`
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
