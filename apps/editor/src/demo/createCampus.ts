import { loadSceneDocument } from '@twin-studio/core'
import { assetRepository, HttpSceneRepository, projectApi } from '@/api/repositories'
import manifest from './campusAssets.json'

export const campusExamples = [
  {
    key: 'cartoon',
    name: '零碳智慧园区（卡通版）',
    description: '光伏、风电、储能与综合能源站，带能流线和示例设备数据。',
  },
  {
    key: 'detailed',
    name: '储能园区（精致版）',
    description: '精细储能柜阵列、升压站、光伏车棚及充电设施，带分区镜头与温度告警。',
  },
] as const

async function bundled(path: string): Promise<Response> {
  const response = await fetch(import.meta.env.BASE_URL + path)
  if (!response.ok) throw new Error(`案例资源读取失败：${path}（${response.status}）`)
  return response
}

/** Templates contain portable filenames. Resolve them to this backend's real asset IDs before saving. */
export async function createCampus(example: (typeof campusExamples)[number]) {
  const template = await bundled(`campuses/${example.key}.json`)
  const { document } = loadSceneDocument(await template.json())
  const models = document.nodes.filter(node => node.kind === 'model')
  const ids = new Map<string, string>()
  for (const filename of new Set(models.map(node => node.model.assetId))) {
    const resource = manifest[filename as keyof typeof manifest]
    if (!resource) throw new Error(`案例缺少模型：${filename}`)
    const blob = await (await bundled(resource.path)).blob()
    const file = new File([blob], filename, { type: 'model/gltf-binary', lastModified: 0 })
    const { asset } = await assetRepository.uploadFile(file, 'model', { title: resource.title })
    ids.set(filename, asset.id)
  }
  for (const node of models) node.model.assetId = ids.get(node.model.assetId)!
  const project = await projectApi.create(example.name, example.description)
  document.projectId = project.id
  document.metadata = { name: project.name, updatedAt: new Date().toISOString() }
  const scenes = new HttpSceneRepository()
  try {
    await scenes.save(document)
  } catch (error) {
    // A lost response can follow a successful write. Check before removing an empty new project.
    const saved = await scenes.load(project.id)
    if (!saved) {
      await projectApi.remove(project.id)
      throw error
    }
  }
  try {
    const cover = await bundled(`campuses/${example.key}.jpg`)
    await projectApi.setCover(project.id, await cover.blob())
    return { project, coverSaved: true }
  } catch {
    return { project, coverSaved: false }
  }
}
