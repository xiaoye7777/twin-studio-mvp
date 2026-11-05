/*
 * 把接口返回的数据解析成「绑定 + 变量 + 值」。HTTP 轮询和 WebSocket 共用。
 *
 * 后端的数据格式各不相同，所以由接口配置的 mapping 说明（格式、设备编号字段、变量字段对照）。不写 mapping
 * 就是默认格式：每条 { deviceId, 变量名: 值 }，或变量放在 values 里。
 * 文本形式的数字（"72.5"）和 0 / 1 形式的布尔值会按变量类型转换；转换不了的值被忽略。
 */
import type { SourceMapping } from '../../domain/dataSources'
import type { TwinBinding, TwinRuntimeValueData, TwinVariableDataType } from '../../domain/twin'

export const DEFAULT_DEVICE_FIELD = 'deviceId'
export const DEFAULT_METRIC_FIELD = 'metric'
export const DEFAULT_VALUE_FIELD = 'value'

export interface DeviceValueUpdate {
  bindingId: string
  variableKey: string
  value: TwinRuntimeValueData
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** 按 a.b[0].c 读取；空路径是值本身。 */
export function readPath(value: unknown, path: string): unknown {
  let current = value
  for (const part of path
    .replace(/\[(\d+)\]/g, '.$1')
    .split('.')
    .filter(Boolean)) {
    if (current === null || typeof current !== 'object') return undefined
    current = (current as Record<string, unknown>)[part]
  }
  return current
}

function coerce(value: unknown, dataType: TwinVariableDataType): TwinRuntimeValueData | undefined {
  if (dataType === 'number') {
    if (typeof value === 'number') return Number.isFinite(value) ? value : undefined
    if (typeof value === 'string' && value.trim() !== '') {
      const number = Number(value)
      return Number.isFinite(number) ? number : undefined
    }
    return undefined
  }
  if (dataType === 'boolean') {
    if (typeof value === 'boolean') return value
    if (value === 1 || value === '1' || value === 'true') return true
    if (value === 0 || value === '0' || value === 'false') return false
    return undefined
  }
  if (typeof value === 'string') return value
  return typeof value === 'number' || typeof value === 'boolean' ? String(value) : undefined
}

const rowsOf = (payload: unknown): unknown[] => (Array.isArray(payload) ? payload : payload == null ? [] : [payload])
const textOf = (value: unknown): string | null =>
  typeof value === 'string' || typeof value === 'number' ? String(value) : null

/** 这条数据属于哪些绑定。设备编号字段留空：接口专用于「涉及设备」，每条都算它们的。 */
function bindingsOfRow(row: Record<string, unknown>, bindings: readonly TwinBinding[], deviceField: string) {
  if (!deviceField) return bindings
  const deviceId = textOf(readPath(row, deviceField))
  return deviceId ? bindings.filter(binding => binding.device.id === deviceId) : []
}

/** 接口里的字段名：对照表里有就用它，否则和变量键同名。 */
const fieldOf = (key: string, mapping: SourceMapping | undefined) => mapping?.fields?.[key] ?? key

/** 一组变量值（一个对象）写给一组绑定。 */
function readValues(
  values: unknown,
  bindings: readonly TwinBinding[],
  mapping: SourceMapping | undefined,
): DeviceValueUpdate[] {
  if (!isRecord(values)) return []
  return bindings.flatMap(binding =>
    binding.variables.flatMap(variable => {
      const value = coerce(readPath(values, fieldOf(variable.key, mapping)), variable.dataType)
      return value === undefined ? [] : [{ bindingId: binding.id, variableKey: variable.key, value }]
    }),
  )
}

/** 解析一次返回（已经按 resultPath 取出的部分）。 */
export function mapDeviceMessages(
  payload: unknown,
  bindings: readonly TwinBinding[],
  mapping?: SourceMapping,
): DeviceValueUpdate[] {
  const format = mapping?.format ?? 'device-row'
  const deviceField = mapping?.deviceField ?? DEFAULT_DEVICE_FIELD

  if (format === 'device-map') {
    if (!isRecord(payload)) return []
    return Object.entries(payload).flatMap(([deviceId, row]) => {
      const values = mapping?.valuesPath ? readPath(row, mapping.valuesPath) : row
      return readValues(
        values,
        bindings.filter(binding => binding.device.id === deviceId),
        mapping,
      )
    })
  }

  if (format === 'metric-row') {
    const metricField = mapping?.metricField || DEFAULT_METRIC_FIELD
    const valueField = mapping?.valueField || DEFAULT_VALUE_FIELD
    return rowsOf(payload).flatMap(row => {
      if (!isRecord(row)) return []
      const metric = textOf(readPath(row, metricField))
      if (metric === null) return []
      return bindingsOfRow(row, bindings, deviceField).flatMap(binding =>
        binding.variables.flatMap(variable => {
          if (fieldOf(variable.key, mapping) !== metric) return []
          const value = coerce(readPath(row, valueField), variable.dataType)
          return value === undefined ? [] : [{ bindingId: binding.id, variableKey: variable.key, value }]
        }),
      )
    })
  }

  return rowsOf(payload).flatMap(row => {
    if (!isRecord(row)) return []
    const values = mapping?.valuesPath ? readPath(row, mapping.valuesPath) : isRecord(row.values) ? row.values : row
    return readValues(values, bindingsOfRow(row, bindings, deviceField), mapping)
  })
}

export interface MessageAnalysis {
  /** 返回里有多少条数据。 */
  rows: number
  /** 返回里出现的设备编号。 */
  deviceIds: string[]
  /** 其中本接口涉及的设备。 */
  matched: string[]
  /** 能写入的变量值个数。 */
  values: number
}

/** 试请求时用：告诉用户这份返回能解析出什么。 */
export function analyzeMessages(
  payload: unknown,
  bindings: readonly TwinBinding[],
  mapping?: SourceMapping,
): MessageAnalysis {
  const format = mapping?.format ?? 'device-row'
  const deviceField = mapping?.deviceField ?? DEFAULT_DEVICE_FIELD
  const rows = format === 'device-map' ? (isRecord(payload) ? Object.keys(payload) : []) : rowsOf(payload)
  const found =
    format === 'device-map'
      ? (rows as string[])
      : deviceField
        ? rows.flatMap(row => (isRecord(row) ? (textOf(readPath(row, deviceField)) ?? []) : []))
        : []
  const deviceIds = [...new Set(found)]
  const known = new Set(bindings.map(binding => binding.device.id))
  return {
    rows: rows.length,
    deviceIds,
    matched: deviceField || format === 'device-map' ? deviceIds.filter(id => known.has(id)) : [...known],
    values: mapDeviceMessages(payload, bindings, mapping).length,
  }
}
