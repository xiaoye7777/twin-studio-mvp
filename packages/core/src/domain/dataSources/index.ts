/**
 * 场景的数据接口：设备变量的值从哪里来。一个场景可以同时启用多个，大园区通常每个系统一个接口：
 *
 *   websocket  网关实时推送
 *   http       定时请求一个接口（没有推送服务时）
 *   static     手填的固定值（调试和演示：改数值，立即看效果）
 *
 * 每个接口可以限定「涉及设备」（devices），也可以用 mapping 说明返回数据的格式。所有接口都按
 * 「设备编号 + 变量名」写入同一份运行时数据，数据面板和 Viewer 不关心值从哪来。
 * 同一个变量有多个接口提供时，以列表里靠前的为准；靠前的断开后，靠后的接管。
 *
 * 场景文件会随项目包分发，所以这里不允许保存任何账号、密码或 Token：需要认证的接口用 authRef 引用，
 * Token 由运行环境提供（见 TwinDataRuntime 的 requestHeaders）。
 */
import { z } from 'zod'
import type { TwinBinding } from '../twin'
import { trimmedString, uniqueBy } from '../schemaHelpers'

/** 名字像认证信息（Authorization、token、api-key……）：这类内容不能写进场景文件。 */
export function looksLikeSecret(name: string): boolean {
  return /authorization|token|secret|password|passwd|cookie|session|api[-_]?key|access[-_]?key/i.test(name)
}

/** ws:// or wss:// only; credentials and fragments must never travel inside a project package. */
export function isSafeRealtimeUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return ['ws:', 'wss:'].includes(url.protocol) && !url.username && !url.password && !url.hash
  } catch {
    return false
  }
}

/** http(s):// 或以 / 开头的同域地址；不能带账号密码、# 或名字像 Token 的查询参数。 */
export function isSafeHttpUrl(value: string): boolean {
  if (value.startsWith('//')) return false
  try {
    const relative = value.startsWith('/')
    const url = new URL(value, relative ? 'http://same-origin' : undefined)
    if (![...url.searchParams.keys()].every(key => !looksLikeSecret(key))) return false
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password && !url.hash
  } catch {
    return false
  }
}

/** 这个接口提供哪台设备；variables 不写 = 该设备的全部变量。 */
const SourceDeviceSchema = z.strictObject({
  deviceId: z.string().min(1).max(200),
  variables: z.array(z.string().max(200)).max(500).optional(),
})

/**
 * 返回数据怎么解析成「设备 + 变量」。不写就是默认格式：每条 { deviceId, 变量名: 值 }。
 *
 *   device-row  每条一台设备    [{ deviceId: 'ESS-001', soc: 72 }]
 *   metric-row  每条一个变量    [{ deviceId: 'ESS-001', metric: 'soc', value: 72 }]
 *   device-map  以设备编号为键  { 'ESS-001': { soc: 72 } }
 */
const SourceMappingSchema = z.strictObject({
  format: z.enum(['device-row', 'metric-row', 'device-map']).optional(),
  /** 设备编号的字段，默认 deviceId；留空 = 返回的就是「涉及设备」自己的数据（专用于一台设备的接口）。 */
  deviceField: z.string().max(200).optional(),
  /** 变量值在每条数据里的位置，如 data.metrics；默认是这条数据本身或它的 values。 */
  valuesPath: z.string().max(200).optional(),
  /** metric-row：变量名字段，默认 metric。 */
  metricField: z.string().max(200).optional(),
  /** metric-row：值字段，默认 value。 */
  valueField: z.string().max(200).optional(),
  /** 变量键 → 接口里的字段（名字不一样时才需要），如 soc → stateOfCharge。 */
  fields: z.record(z.string().max(200), z.string().max(200)).optional(),
})

const KeyValueSchema = z.strictObject({ key: z.string().max(200), value: z.string().max(2000) })
const publicKeyValues = z
  .array(KeyValueSchema)
  .max(50)
  .refine(items => items.every(item => !looksLikeSecret(item.key)), {
    message: '认证信息不能写进场景文件，请在「认证」里选择',
  })

/** 所有接口共有的字段。 */
const sourceBase = {
  id: trimmedString,
  name: trimmedString,
  enabled: z.boolean(),
  /** 涉及设备；不写 = 全部设备（按返回数据里的设备编号自动匹配）。 */
  devices: z.array(SourceDeviceSchema).max(2000).optional(),
}

// 严格对象：多出来的字段（比如 Token）直接报错，既不保留也不悄悄丢掉。
const WebSocketDataSourceSchema = z.strictObject({
  ...sourceBase,
  type: z.literal('websocket'),
  url: z.string().refine(isSafeRealtimeUrl, { message: '地址必须是 ws:// 或 wss://，且不能包含用户名、密码或 #' }),
  /** 设备消息在每条推送里的位置，如 payload；空或不写 = 整条消息。 */
  resultPath: z.string().max(200).optional(),
  /** 连上后发送的第一条消息；不写 = 发送本接口涉及的设备清单。 */
  subscribe: z.string().max(4000).optional(),
  /** 心跳：有些网关会断开长时间没有消息的连接。 */
  heartbeat: z.strictObject({ interval: z.number().int().min(1).max(3600), message: z.string().max(1000) }).optional(),
  mapping: SourceMappingSchema.optional(),
})

const HttpDataSourceSchema = z.strictObject({
  ...sourceBase,
  type: z.literal('http'),
  url: z.string().refine(isSafeHttpUrl, {
    message: '地址必须是 http(s):// 或以 / 开头，且不能包含用户名、密码、# 或 Token 参数',
  }),
  method: z.enum(['GET', 'POST']),
  /** 请求间隔（秒）。 */
  interval: z.number().int().min(1).max(3600),
  /** 超时（秒）；不写 = 不超过间隔，也不超过 15 秒。 */
  timeout: z.number().int().min(1).max(120).optional(),
  /** 查询参数。 */
  params: publicKeyValues.optional(),
  /** 请求头（认证信息除外）。 */
  headers: publicKeyValues.optional(),
  /** 设备消息在返回值中的位置，如 data.list；空表示整个返回值。 */
  resultPath: z.string().max(200),
  /** POST 的 JSON 请求体（文本）。 */
  body: z.string().max(4000).optional(),
  /** 带上浏览器中该站点的登录 Cookie（需要后端允许带凭据的跨域）。 */
  withCredentials: z.boolean(),
  /**
   * 认证引用：编辑器里是「数据接口」中某个数据服务的 ID（Token 只留在本机），
   * SDK 里由集成方的 dataRequestHeaders 决定。场景文件里只有这个引用。
   */
  authRef: z.string().max(200).optional(),
  /** 后端用 { code, msg, data } 包装结果、HTTP 200 也可能是失败时，auto 会按 code 判断。默认 auto。 */
  envelope: z.enum(['auto', 'off']).optional(),
  mapping: SourceMappingSchema.optional(),
})

const StaticValueSchema = z.union([z.number(), z.string().max(500), z.boolean()])
const StaticDataSourceSchema = z.strictObject({
  ...sourceBase,
  type: z.literal('static'),
  /** 设备编号 → 变量名 → 值。 */
  values: z.record(z.string().max(200), z.record(z.string().max(200), StaticValueSchema)),
})

export const ProjectDataSourceSchema = z.discriminatedUnion('type', [
  WebSocketDataSourceSchema,
  HttpDataSourceSchema,
  StaticDataSourceSchema,
])

export const ProjectDataSourcesSchema = z
  .array(ProjectDataSourceSchema)
  .max(64)
  .superRefine(uniqueBy(source => source.id, '数据源 ID'))

export type ProjectDataSource = z.infer<typeof ProjectDataSourceSchema>
export type WebSocketDataSourceConfig = Extract<ProjectDataSource, { type: 'websocket' }>
export type HttpDataSourceConfig = Extract<ProjectDataSource, { type: 'http' }>
export type StaticDataSourceConfig = Extract<ProjectDataSource, { type: 'static' }>
export type SourceDevice = z.infer<typeof SourceDeviceSchema>
export type SourceMapping = z.infer<typeof SourceMappingSchema>
export type SourceKeyValue = z.infer<typeof KeyValueSchema>
export type ActiveDataSourceConfig = WebSocketDataSourceConfig | HttpDataSourceConfig | StaticDataSourceConfig

export function isProjectDataSources(value: unknown): value is ProjectDataSource[] {
  return ProjectDataSourcesSchema.safeParse(value).success
}

/** 新建数据接口时的默认配置；地址只是占位，要改成真实地址。 */
export function newDataSource(type: ActiveDataSourceConfig['type'], id: string): ActiveDataSourceConfig {
  if (type === 'http')
    return {
      id,
      name: '定时请求',
      type,
      enabled: true,
      url: '/api/devices/latest',
      method: 'GET',
      interval: 5,
      resultPath: 'data',
      withCredentials: false,
    }
  if (type === 'static') return { id, name: '静态数据', type, enabled: true, values: {} }
  return { id, name: '实时推送', type, enabled: true, url: 'ws://127.0.0.1:8787/realtime' }
}

/** 所有启用、会产生数据的接口，按列表顺序（靠前的优先）。没有这个字段、空数组、全部停用都表示「没有数据」。 */
export function activeDataSources(sources?: ProjectDataSource[]): ActiveDataSourceConfig[] {
  const values = sources ?? []
  if (!isProjectDataSources(values)) throw new Error('数据源配置无效（地址格式不对或包含账号密码）')
  return values.filter(source => source.enabled)
}

/** 第一个启用的接口。场景有多个接口时请用 activeDataSources。 */
export function activeDataSource(sources?: ProjectDataSource[]): ActiveDataSourceConfig | null {
  return activeDataSources(sources)[0] ?? null
}

/** 这个接口是否提供某台设备的某个变量（只看「涉及设备」的范围）。 */
export function sourceProvides(
  source: Pick<ActiveDataSourceConfig, 'devices'>,
  deviceId: string,
  key: string,
): boolean {
  if (!source.devices) return true
  const device = source.devices.find(item => item.deviceId === deviceId)
  return !!device && (!device.variables || device.variables.includes(key))
}

/** 这个接口看得到的绑定：按「涉及设备」筛选设备和变量，订阅消息和数据写入都只针对这些。 */
export function bindingsForSource(
  source: Pick<ActiveDataSourceConfig, 'devices'>,
  bindings: readonly TwinBinding[],
): readonly TwinBinding[] {
  if (!source.devices) return bindings
  return bindings.flatMap(binding => {
    const variables = binding.variables.filter(variable => sourceProvides(source, binding.device.id, variable.key))
    return variables.length ? [{ ...binding, variables }] : []
  })
}
