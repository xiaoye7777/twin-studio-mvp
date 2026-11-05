<script setup lang="ts">
/**
 * 数据解析：接口返回的数据怎么变成「设备 + 变量」。
 *   数据位置     设备数据在返回里的位置（去掉 { code, data } 这类外壳）
 *   数据格式     每条一台设备 / 每条一个变量 / 以设备编号为键
 *   字段对照     变量键和接口字段名不一样时才需要填
 * 解析逻辑在 core 的 messageMapping.ts。
 */
import { computed } from 'vue'
import {
  bindingsForSource,
  DEFAULT_DEVICE_FIELD,
  DEFAULT_METRIC_FIELD,
  DEFAULT_VALUE_FIELD,
  type HttpDataSourceConfig,
  type SourceMapping,
  type WebSocketDataSourceConfig,
} from '@twin-studio/core'
import UiRow from '@/components/ui/UiRow.vue'
import UiSection from '@/components/ui/UiSection.vue'
import UiSwitch from '@/components/ui/UiSwitch.vue'
import { useSession } from '@/studio/context'
import FieldInput from './FieldInput.vue'

const props = defineProps<{
  source: HttpDataSourceConfig | WebSocketDataSourceConfig
  /** 试请求得到的字段名。 */
  fields: readonly string[]
}>()
const session = useSession()

const mapping = computed<SourceMapping>(() => props.source.mapping ?? {})
const format = computed(() => mapping.value.format ?? 'device-row')
const formats = [
  { value: 'device-row', label: '每条一台设备', example: '[{ "deviceId": "ESS-001", "soc": 72 }]' },
  { value: 'metric-row', label: '每条一个变量', example: '[{ "deviceId": "ESS-001", "metric": "soc", "value": 72 }]' },
  { value: 'device-map', label: '以设备编号为键', example: '{ "ESS-001": { "soc": 72 } }' },
] as const
const example = computed(() => formats.find(item => item.value === format.value)!.example)

function setMapping(patch: Partial<SourceMapping>): void {
  // 全部是默认值时不写 mapping，场景文件保持干净。
  const next = Object.fromEntries(
    Object.entries({ ...mapping.value, ...patch }).filter(([, value]) => value !== undefined),
  ) as SourceMapping
  session.devices.updateSource(props.source.id, { mapping: Object.keys(next).length ? next : undefined })
}
/** 留空表示用默认值。设备编号字段例外：留空有专门的含义，用单独的开关。 */
const setText = (key: 'valuesPath' | 'metricField' | 'valueField', value: string) =>
  setMapping({ [key]: value || undefined })

const hasDeviceField = computed(() => mapping.value.deviceField !== '')

/** 本接口涉及的变量（去重），用来填字段对照。 */
const variables = computed(() => {
  const seen = new Map<string, string>()
  for (const binding of bindingsForSource(props.source, session.doc.value.bindings))
    for (const variable of binding.variables) if (!seen.has(variable.key)) seen.set(variable.key, variable.name)
  return [...seen].map(([key, name]) => ({ key, name }))
})
const mapped = computed(() => Object.keys(mapping.value.fields ?? {}).length)

function setField(key: string, field: string): void {
  const fields = { ...mapping.value.fields }
  if (field && field !== key) fields[key] = field
  else delete fields[key]
  setMapping({ fields: Object.keys(fields).length ? fields : undefined })
}
</script>

<template>
  <UiSection title="数据解析" nested :open="false">
    <UiRow label="数据位置" hint="设备数据在返回值中的位置，如 data 或 data.list；留空表示整个返回值">
      <FieldInput
        :model-value="source.resultPath ?? ''"
        placeholder="（整个返回值）"
        testid="source-result-path"
        @commit="session.devices.updateSource(source.id, { resultPath: $event })"
      />
    </UiRow>
    <UiRow label="数据格式">
      <select
        class="s-select"
        :value="format"
        data-testid="source-format"
        @change="setMapping({ format: ($event.target as HTMLSelectElement).value as SourceMapping['format'] })"
      >
        <option v-for="item in formats" :key="item.value" :value="item.value">{{ item.label }}</option>
      </select>
    </UiRow>
    <p class="parsing__example s-mono">{{ example }}</p>

    <template v-if="format !== 'device-map'">
      <UiRow
        label="含设备编号"
        hint="关闭：这个接口专门返回一台设备的数据，返回里没有设备编号（在「涉及设备」里指定是哪台）"
      >
        <UiSwitch
          :model-value="hasDeviceField"
          @update:model-value="setMapping({ deviceField: $event ? undefined : '' })"
        />
      </UiRow>
      <UiRow v-if="hasDeviceField" label="设备编号字段">
        <FieldInput
          :model-value="mapping.deviceField ?? ''"
          :fields="fields"
          :placeholder="DEFAULT_DEVICE_FIELD"
          testid="source-device-field"
          @commit="setMapping({ deviceField: $event || undefined })"
        />
      </UiRow>
    </template>
    <template v-if="format === 'metric-row'">
      <UiRow label="变量名字段">
        <FieldInput
          :model-value="mapping.metricField ?? ''"
          :fields="fields"
          :placeholder="DEFAULT_METRIC_FIELD"
          testid="source-metric-field"
          @commit="setText('metricField', $event)"
        />
      </UiRow>
      <UiRow label="值字段">
        <FieldInput
          :model-value="mapping.valueField ?? ''"
          :fields="fields"
          :placeholder="DEFAULT_VALUE_FIELD"
          testid="source-value-field"
          @commit="setText('valueField', $event)"
        />
      </UiRow>
    </template>
    <UiRow v-else label="变量值位置" hint="变量值在每条数据里的位置，如 metrics；留空表示这条数据本身或它的 values">
      <FieldInput
        :model-value="mapping.valuesPath ?? ''"
        :fields="fields"
        placeholder="（这条数据本身）"
        @commit="setText('valuesPath', $event)"
      />
    </UiRow>
    <UiRow
      v-if="source.type === 'http'"
      label="按 code 判断"
      hint="后端用 { code, msg, data } 包装结果时，HTTP 200 也可能是失败，打开后会按 code 判断并显示 msg"
    >
      <UiSwitch
        :model-value="source.envelope !== 'off'"
        @update:model-value="session.devices.updateSource(source.id, { envelope: $event ? undefined : 'off' })"
      />
    </UiRow>

    <UiSection v-if="variables.length" title="字段对照" nested :open="mapped > 0" :count="mapped || null">
      <p class="parsing__note s-hint">接口的字段名和变量键不一样时才需要填，留空表示同名。</p>
      <UiRow
        v-for="variable in variables"
        :key="variable.key"
        :label="variable.name || variable.key"
        :hint="variable.key"
      >
        <FieldInput
          :model-value="mapping.fields?.[variable.key] ?? ''"
          :fields="fields"
          :placeholder="variable.key"
          :testid="`source-field-${variable.key}`"
          @commit="setField(variable.key, $event)"
        />
      </UiRow>
    </UiSection>
  </UiSection>
</template>

<style scoped>
.parsing__example {
  margin: 0 12px 4px;
  padding: 3px 6px;
  border-radius: var(--s-radius-sm);
  background: var(--s-field);
  color: var(--s-fg-3);
  font-size: 10.5px;
  word-break: break-all;
}
.parsing__note {
  margin: 0;
  padding: 0 12px 4px;
}
</style>
