/*
 * 内置模型：卡通的（低面数）和写实的（真实米制）。作者和来源见 public/models/CREDITS.md。
 * 第一次拖进场景时才上传进资源库；后端按内容去重，重复上传也只有一份。
 */
import type { AssetRecord } from '@twin-studio/core'
import { assetRepository } from '@/api/repositories'

export type BuiltinModelStyle = '卡通' | '写实'

export interface BuiltinModel {
  key: string
  /** public/models 下的文件名。 */
  file: string
  name: string
  style: BuiltinModelStyle
  /** 放进场景时的缩放：卡通模型只有一两个单位大，放大后和写实模型比例一致。 */
  scale?: number
}

export const builtinModels: readonly BuiltinModel[] = [
  { key: 'essCabinet', file: 'ess-cabinet-basic.glb', name: '储能柜', style: '写实' },
  { key: 'utilityCabinet', file: 'utility-cabinet.glb', name: '配电柜', style: '写实' },
  { key: 'breakerPanel', file: 'breaker-panel.glb', name: '配电箱', style: '写实' },
  { key: 'streetLamp', file: 'street-lamp.glb', name: '路灯', style: '写实' },
  { key: 'oilDrum', file: 'oil-drum.glb', name: '油桶', style: '写实' },
  { key: 'extinguisher', file: 'fire-extinguisher.glb', name: '灭火器', style: '写实' },
  { key: 'container', file: 'energy-storage-container.glb', name: '储能集装箱', style: '卡通', scale: 7.4 },
  { key: 'solar', file: 'solar-array.glb', name: '光伏阵列', style: '卡通', scale: 5 },
  { key: 'turbine', file: 'wind-turbine.glb', name: '风力发电机', style: '卡通', scale: 20 },
  { key: 'tank', file: 'thermal-storage-tank.glb', name: '储热罐', style: '卡通', scale: 8 },
  { key: 'energyCenter', file: 'energy-center.glb', name: '能源中心', style: '卡通', scale: 15 },
  { key: 'office', file: 'office-tower.glb', name: '办公楼', style: '卡通', scale: 14 },
  { key: 'factory', file: 'factory.glb', name: '制造车间', style: '卡通', scale: 16 },
  { key: 'warehouse', file: 'warehouse.glb', name: '仓库', style: '卡通', scale: 18 },
  { key: 'tree', file: 'tree-broadleaf-a.glb', name: '树', style: '卡通' },
  { key: 'bush', file: 'bush.glb', name: '灌木', style: '卡通' },
]

export function getBuiltinModel(key: string): BuiltinModel | undefined {
  return builtinModels.find(model => model.key === key)
}

export function builtinThumbnailUrl(model: BuiltinModel): string {
  return `${import.meta.env.BASE_URL}models/thumbs/${model.file.replace(/\.glb$/, '.webp')}`
}

/** 把内置模型上传进资源库，返回它的资源记录。 */
export async function uploadBuiltinModel(model: BuiltinModel): Promise<AssetRecord> {
  const response = await fetch(`${import.meta.env.BASE_URL}models/${model.file}`)
  if (!response.ok) throw new Error(`内置模型加载失败：${model.name}（HTTP ${response.status}）`)
  const bytes = new Uint8Array(await response.arrayBuffer())
  return assetRepository.saveFile(
    new File([bytes], model.file, { type: 'model/gltf-binary', lastModified: 0 }),
    'model',
  )
}
