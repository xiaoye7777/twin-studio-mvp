/*
 * 场景文档 v2 的 zod schema：节点、变换、设置、设备绑定、镜头、数据面板、数据接口。
 * 读取任何场景文件都要先过这里的校验。
 *
 * 节点是一个有序列表，每个节点有稳定的 id 和父节点；数组顺序就是同级的显示顺序。
 */
import { z } from 'zod'
import { ProjectDataSourcesSchema } from '../dataSources'
import { PanelInstanceSchema, PanelTemplateSchema } from '../panels'
import { nonEmptyString, uniqueBy } from '../schemaHelpers'
import { TwinBindingSchema } from '../twin'
import { SceneTransformSchema, Vector3TupleSchema } from './sceneSchema'
import { SceneSettingsSchemaV2 } from './sceneSettingsV2'

const nodeBase = {
  id: nonEmptyString,
  /** 顶层节点是 null，否则是某个分组节点的 id。 */
  parentId: nonEmptyString.nullable(),
  name: z.string(),
  transform: SceneTransformSchema,
  visible: z.boolean(),
  locked: z.boolean(),
}

export const ModelNodeSchemaV2 = z.object({
  ...nodeBase,
  kind: z.literal('model'),
  model: z.object({ assetId: z.string() }),
})

export const GroupNodeSchemaV2 = z.object({ ...nodeBase, kind: z.literal('group') })

export const SceneNodeSchemaV2 = z.discriminatedUnion('kind', [ModelNodeSchemaV2, GroupNodeSchemaV2])

export const SCENE_NODE_KINDS: readonly string[] = ['model', 'group']

type NodeLike = { id: string; parentId: string | null; kind: string }

/** id 不重复；父节点必须存在且是分组；不能成环。 */
function checkHierarchy(nodes: readonly NodeLike[], ctx: z.RefinementCtx): void {
  const byId = new Map<string, NodeLike>()
  nodes.forEach((node, index) => {
    if (byId.has(node.id)) ctx.addIssue({ code: 'custom', path: [index, 'id'], message: `节点 ID 重复：${node.id}` })
    byId.set(node.id, node)
  })
  nodes.forEach((node, index) => {
    if (node.parentId === null) return
    const parent = byId.get(node.parentId)
    if (!parent) {
      ctx.addIssue({ code: 'custom', path: [index, 'parentId'], message: `父节点不存在：${node.parentId}` })
      return
    }
    if (parent.kind !== 'group') {
      ctx.addIssue({ code: 'custom', path: [index, 'parentId'], message: `父节点必须是组：${node.parentId}` })
      return
    }
    const seen = new Set([node.id])
    for (let current: NodeLike | undefined = parent; current; current = byId.get(current.parentId ?? '')) {
      if (seen.has(current.id)) {
        ctx.addIssue({ code: 'custom', path: [index, 'parentId'], message: `节点层级存在循环：${node.id}` })
        return
      }
      seen.add(current.id)
      if (current.parentId === null) break
    }
  })
}

export const CameraViewSchemaV2 = z.object({
  position: Vector3TupleSchema,
  target: Vector3TupleSchema,
  fov: z.number().min(5).max(120).optional(),
  /** 保存视角时画面的宽高比；屏幕更窄时相机后退，保证宽度都看得到。 */
  aspect: z.number().min(0.1).max(10).optional(),
})

/** 镜头：一个保存下来的视角。 */
export const CameraBookmarkSchema = z.object({
  id: nonEmptyString,
  name: z.string().max(80),
  view: CameraViewSchemaV2,
  /** 镜头卡片上的缩略图（小尺寸 JPEG 的 data URL）。 */
  thumbnail: z.string().max(80_000).optional(),
})

export const SceneDocumentSchemaV2 = z.object({
  version: z.literal(2),
  projectId: z.string(),
  metadata: z.object({ name: z.string().optional(), updatedAt: z.string() }),
  /** 不写就是没有配置数据接口。 */
  dataSources: ProjectDataSourcesSchema.optional(),
  settings: SceneSettingsSchemaV2,
  /** 打开场景时的视角。 */
  cameraView: CameraViewSchemaV2.optional(),
  nodes: z.array(SceneNodeSchemaV2).superRefine(checkHierarchy),
  bindings: z.array(TwinBindingSchema),
  bookmarks: z
    .array(CameraBookmarkSchema)
    .max(200)
    .superRefine(uniqueBy(item => item.id, '镜头 ID')),
  panelTemplates: z
    .array(PanelTemplateSchema)
    .max(100)
    .superRefine(uniqueBy(item => item.id, '面板模板 ID'))
    .default([]),
  panels: z
    .array(PanelInstanceSchema)
    .max(5000)
    .superRefine(uniqueBy(item => item.id, '面板实例 ID'))
    .default([]),
})

export function isSceneDocumentV2(value: unknown): value is z.infer<typeof SceneDocumentSchemaV2> {
  return SceneDocumentSchemaV2.safeParse(value).success
}
