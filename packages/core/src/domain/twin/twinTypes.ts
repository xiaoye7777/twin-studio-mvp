import type { z } from 'zod'
import type { TwinDeviceSchema, TwinVariableDataTypeSchema, TwinVariableDefinitionSchema } from './schema'

export type TwinVariableDataType = z.infer<typeof TwinVariableDataTypeSchema>
export type TwinDevice = z.infer<typeof TwinDeviceSchema>
export type TwinVariableDefinition = z.infer<typeof TwinVariableDefinitionSchema>

/** Runtime-only values: never saved in a scene document, so they have no schema. */
export type TwinRuntimeValueData = number | boolean | string

export interface TwinRuntimeValue {
  bindingId: string
  variableKey: string
  value: TwinRuntimeValueData
  updatedAt: string
  /** 这个值来自哪个数据接口。 */
  sourceId?: string
}
