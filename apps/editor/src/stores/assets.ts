import { ref } from 'vue'
import { defineStore } from 'pinia'
import type { AssetMetadata } from '@twin-studio/core'
import { assetRepository } from '@/api/repositories'

/** 资源库里上传的模型（不含还没用过的内置模型）。 */
export const useAssetStore = defineStore('assets', () => {
  const assets = ref<AssetMetadata[]>([])

  async function refresh(): Promise<void> {
    assets.value = (await assetRepository.listMetadata()).filter(asset => asset.assetType === 'model')
  }

  async function upload(file: File): Promise<AssetMetadata> {
    const record = await assetRepository.saveFile(file, 'model')
    await refresh()
    return record
  }

  async function remove(id: string, force = false): Promise<void> {
    await assetRepository.remove(id, force)
    assets.value = assets.value.filter(asset => asset.id !== id)
  }

  return { assets, refresh, upload, remove }
})
