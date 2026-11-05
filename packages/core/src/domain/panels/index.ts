/*
 * 数据面板：点击对象时弹出的浮窗，结构和游戏引擎的预制体一样。
 *
 *   模板（PanelTemplate）   定义标题和要展示哪些变量，改模板，所有实例一起变
 *   实例（PanelInstance）   把模板挂到一个场景节点上，只保存和模板不同的地方（覆盖）
 *
 * 数值不存在这里：实例所在节点绑定了设备，字段按变量名从运行时数据里取。
 */
import { z } from 'zod'
import { nonEmptyString, uniqueBy } from '../schemaHelpers'

export const PanelFieldSchema = z.object({
  id: nonEmptyString,
  /** 面板上显示的名字。 */
  label: z.string().max(80),
  /** 设备变量的键，如 soc。 */
  variableKey: z.string().max(200),
  unit: z.string().max(20).optional(),
})

export const PanelTemplateSchema = z.object({
  id: nonEmptyString,
  name: z.string().max(80),
  /** 面板标题；留空就用设备名，没有设备就用节点名。 */
  title: z.string().max(80),
  fields: z
    .array(PanelFieldSchema)
    .max(50)
    .superRefine(uniqueBy(field => field.id, '面板字段 ID')),
})

export const PanelInstanceSchema = z.object({
  id: nonEmptyString,
  templateId: nonEmptyString,
  nodeId: nonEmptyString,
  /** 覆盖模板的标题；不写就跟随模板。 */
  title: z.string().max(80).optional(),
  /** 这个实例隐藏哪些字段；不写就全部显示。 */
  hiddenFields: z.array(z.string()).max(50).optional(),
})

export type PanelField = z.infer<typeof PanelFieldSchema>
export type PanelTemplate = z.infer<typeof PanelTemplateSchema>
export type PanelInstance = z.infer<typeof PanelInstanceSchema>
