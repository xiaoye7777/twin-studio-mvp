import { ref } from 'vue'
import { defineStore } from 'pinia'
import { adapter } from '@/api/adapter'
import { download } from '@/api/http'
import { assetRepository, type LibraryModel } from '@/api/repositories'

export const useAssetStore = defineStore('assets', () => {
  const assets = ref<LibraryModel[]>([])
  let revision = 0
  const generating = new Set<string>()

  async function refresh(): Promise<void> {
    const request = ++revision
    const records = await assetRepository.listMetadata()
    if (request === revision) assets.value = records.filter(asset => asset.assetType === 'model')
  }

  async function upload(file: File, title: string, thumbnail: Blob | null) {
    const result = await assetRepository.uploadFile(file, 'model', { title, thumbnail })
    await refresh()
    return result
  }

  async function rename(id: string, title: string): Promise<void> {
    const updated = await assetRepository.rename(id, title)
    const asset = assets.value.find(item => item.id === id)
    if (asset) asset.title = updated.title
  }

  async function remove(id: string, force = false): Promise<void> {
    await assetRepository.remove(id, force)
    assets.value = assets.value.filter(asset => asset.id !== id)
  }

  /** 升级前上传的条目没有缩略图，卡片可见时补一次。失败时保留占位图。 */
  async function fillThumbnail(id: string, visible: () => boolean): Promise<void> {
    if (generating.has(id)) return
    generating.add(id)
    try {
      const { modelThumbnail } = await import('@/library/modelThumbnail')
      const blob = await modelThumbnail(() =>
        visible() ? download(adapter.assetContentPath(id)) : Promise.resolve(null),
      )
      if (!blob) return
      const updated = await assetRepository.saveThumbnail(id, blob)
      const asset = assets.value.find(item => item.id === id)
      if (asset) asset.thumbnailUrl = updated.thumbnailUrl
    } catch {
      // 浏览器可能没有 WebGL，模型仍然可以管理和放入场景。
    } finally {
      generating.delete(id)
    }
  }

  return { assets, refresh, upload, rename, remove, fillThumbnail }
})
