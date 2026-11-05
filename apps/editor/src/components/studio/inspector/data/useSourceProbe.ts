import { computed, reactive, ref, shallowRef } from 'vue'
import {
  analyzeMessages,
  bindingsForSource,
  type DataSourceProbeResult,
  type HttpDataSourceConfig,
  readPath,
  type WebSocketDataSourceConfig,
} from '@twin-studio/core'
import { useSession } from '@/studio/context'
import { findLists, guessResultPath, inferFieldKeys } from './responseShape'

/**
 * 试请求的结果和由它得出的信息。结果只放在内存里；改数据解析的设置时，分析结果立刻按新设置重新算，
 * 不用再请求一次。
 */
export function useSourceProbe(source: () => HttpDataSourceConfig | WebSocketDataSourceConfig) {
  const session = useSession()
  const testing = ref(false)
  const result = shallowRef<DataSourceProbeResult | null>(null)

  /** 按「数据位置」取出的部分。 */
  const data = computed(() => (result.value?.ok ? readPath(result.value.body, source().resultPath ?? '') : undefined))
  const analysis = computed(() =>
    result.value?.ok
      ? analyzeMessages(data.value, bindingsForSource(source(), session.doc.value.bindings), source().mapping)
      : null,
  )
  /** 返回数据里的字段名，供数据解析的输入框提示。 */
  const fields = computed(() => (data.value === undefined ? [] : inferFieldKeys(data.value)))

  /** 数据位置没填、或没指到数据列表时，自动定位到返回里的列表。以设备编号为键的格式本来就不是列表，不动。 */
  function locateData(body: unknown): void {
    const { resultPath = '', mapping } = source()
    if (mapping?.format === 'device-map') return
    const current = readPath(body, resultPath)
    const missed = !resultPath || current === undefined || (!Array.isArray(current) && findLists(current).length > 0)
    if (!missed) return
    const path = guessResultPath(body)
    if (path && path !== resultPath) session.devices.updateSource(source().id, { resultPath: path })
  }

  async function run(): Promise<void> {
    testing.value = true
    try {
      result.value = await session.devices.probeSource(source().id)
      if (result.value?.ok) locateData(result.value.body)
    } finally {
      testing.value = false
    }
  }

  return reactive({ testing, result, data, analysis, fields, run })
}

export type SourceProbeState = ReturnType<typeof useSourceProbe>
