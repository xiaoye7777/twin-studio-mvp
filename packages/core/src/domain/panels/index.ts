/*
 * 信息面板（浮窗），结构和游戏引擎的预制体一样：
 *
 *   标签组（panel-group 节点）  场景树里的父容器，template 定义标题和要展示哪些变量；改模板，下面所有面板一起变
 *   面板（panel 节点）          标签组的子节点，放在场景里的一个位置，只保存和模板不同的地方（覆盖）
 *
 * 面板是三维场景的一部分：大小以米为单位，镜头拉远时和物体一样变小，并且始终面向镜头。
 * 数值不存在这里，字段按变量名从设备的运行时数据里取。
 */
import { z } from 'zod'
import { nonEmptyString, uniqueBy } from '../schemaHelpers'
import { TwinVariableDataTypeSchema } from '../twin/schema'

export const PanelFieldSchema = z.object({
  id: nonEmptyString,
  /** 面板上显示的名字。 */
  label: z.string().max(80),
  /** 设备变量的键，如 soc。 */
  variableKey: z.string().max(200),
  unit: z.string().max(20).optional(),
  /** 设备变量的类型，绑定设备时用；不写时有单位按数值、没单位按文本。 */
  dataType: TwinVariableDataTypeSchema.optional(),
})

export const PanelTemplateSchema = z.object({
  /** 面板标题；留空就用设备名，没有设备就用节点名。 */
  title: z.string().max(80),
  /** 面板宽度（米）。 */
  width: z.number().min(0.2).max(200),
  /** 预览和 Viewer 里什么时候显示：always 一直显示；click 点击关联的对象时才显示。 */
  trigger: z.enum(['always', 'click']),
  fields: z
    .array(PanelFieldSchema)
    .max(50)
    .superRefine(uniqueBy(field => field.id, '面板字段 ID')),
})

export const PanelInstanceSchema = z.object({
  /** 关联的对象：面板显示它绑定的设备的数据，点击它时显示面板（click 模式）。 */
  targetNodeId: nonEmptyString.optional(),
  /** 覆盖模板的标题；不写就跟随模板。 */
  title: z.string().max(80).optional(),
  /** 这个面板隐藏哪些字段；不写就全部显示。 */
  hiddenFields: z.array(z.string()).max(50).optional(),
})

export type PanelField = z.infer<typeof PanelFieldSchema>
export type PanelTemplate = z.infer<typeof PanelTemplateSchema>
export type PanelInstance = z.infer<typeof PanelInstanceSchema>

/** 新标签组的默认模板。 */
export function createPanelTemplate(): PanelTemplate {
  return { title: '', width: 3, trigger: 'always', fields: [] }
}
