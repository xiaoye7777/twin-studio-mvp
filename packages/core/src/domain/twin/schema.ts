import { z } from 'zod'
import { nonEmptyString, uniqueBy } from '../schemaHelpers'

export const TwinBindingTargetSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('asset-instance'), instanceId: nonEmptyString }),
  z.object({ type: z.literal('asset-node'), instanceId: nonEmptyString, assetNodeId: nonEmptyString }),
  z.object({ type: z.literal('primitive'), nodeId: nonEmptyString }),
  /** 任意场景节点（分组等）。 */
  z.object({ type: z.literal('node'), nodeId: nonEmptyString }),
])

export const TwinVariableDataTypeSchema = z.enum(['number', 'boolean', 'string'])

export const TwinVariableDefinitionSchema = z.object({
  id: z.string(),
  key: z.string(),
  name: z.string(),
  dataType: TwinVariableDataTypeSchema,
  unit: z.string().optional(),
})

/** 绑定时复制到对象或标签面板的默认字段。长度与面板字段兼容。 */
const templateVariableSchema = TwinVariableDefinitionSchema.omit({ id: true }).extend({
  key: z.string().trim().min(1, '请输入变量键').max(200),
  name: z.string().trim().min(1, '请输入变量名称').max(80),
  unit: z.string().trim().max(20).optional(),
})

const deviceTemplateSchema = z.object({
  id: nonEmptyString,
  name: z.string().trim().min(1, '请输入设备类型名称'),
  type: z.string().trim().min(1, '请输入类型标识'),
  prefix: z.string().trim().min(1, '请输入编号前缀'),
  variables: z
    .array(templateVariableSchema)
    .max(50)
    .superRefine(uniqueBy(variable => variable.key, '变量键')),
})

export type DeviceTemplate = z.infer<typeof deviceTemplateSchema>
export const DeviceTemplatesSchema = z
  .array(deviceTemplateSchema)
  .superRefine(uniqueBy(template => template.id, '设备类型 ID'))
  .superRefine(uniqueBy(template => template.name, '设备类型名称'))
  .superRefine(uniqueBy(template => template.type, '设备类型标识'))

export const TwinDeviceSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.string().optional(),
})

export const TwinBindingSchema = z.object({
  id: z.string(),
  target: TwinBindingTargetSchema,
  device: TwinDeviceSchema,
  variables: z.array(TwinVariableDefinitionSchema),
})
