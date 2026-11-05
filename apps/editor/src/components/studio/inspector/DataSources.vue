<script setup lang="ts">
/**
 * 没有选中对象时的右栏：场景的接口数据。功能够用就好：WebSocket 推送、HTTP 定时请求、可编辑的静态数据。
 * 默认的数据格式是 [{ deviceId: 'ESS-001', soc: 72 }]，设备和变量在选中对象后的「设备数据」里绑定。
 */
import { Plus, Trash2 } from 'lucide-vue-next'
import { computed, ref } from 'vue'
import {
  type ActiveDataSourceConfig,
  isSafeHttpUrl,
  isSafeRealtimeUrl,
  type ProjectDataSource,
} from '@twin-studio/core'
import UiNumber from '@/components/ui/UiNumber.vue'
import UiRow from '@/components/ui/UiRow.vue'
import UiSection from '@/components/ui/UiSection.vue'
import UiSwitch from '@/components/ui/UiSwitch.vue'
import UiText from '@/components/ui/UiText.vue'
import { useSession } from '@/studio/context'
import StaticValueInput from './StaticValueInput.vue'

const session = useSession()
const doc = computed(() => session.doc.value)
const sources = computed(() => doc.value.dataSources ?? [])
const typeLabels: Record<ProjectDataSource['type'], string> = {
  websocket: 'WebSocket 推送',
  http: 'HTTP 定时请求',
  static: '静态数据',
}
const statusLabels: Record<string, string> = {
  connecting: '连接中',
  connected: '已连接',
  disconnected: '未连接',
  error: '出错',
  unconfigured: '未配置',
}
const adders: Array<{ type: ActiveDataSourceConfig['type']; label: string }> = [
  { type: 'static', label: '静态数据' },
  { type: 'http', label: 'HTTP' },
  { type: 'websocket', label: 'WebSocket' },
]
/** 输入不合法的地址时不写进文档（否则场景保存不了），只显示提示。 */
const urlErrors = ref<Record<string, string>>({})

function state(id: string) {
  return session.twin.dataSourceStates.find(item => item.id === id)
}

function setUrl(source: ProjectDataSource, value: string): void {
  if (source.type === 'static') return
  const url = value.trim()
  const valid = source.type === 'http' ? isSafeHttpUrl(url) : isSafeRealtimeUrl(url)
  if (!valid) {
    urlErrors.value = {
      ...urlErrors.value,
      [source.id]:
        source.type === 'http'
          ? '地址要以 http(s):// 或 / 开头，不能带账号密码或 Token'
          : '地址要以 ws:// 或 wss:// 开头，不能带账号密码',
    }
    return
  }
  const { [source.id]: _cleared, ...rest } = urlErrors.value
  urlErrors.value = rest
  session.devices.updateSource(source.id, { url })
}

function setName(source: ProjectDataSource, value: string): void {
  if (value.trim()) session.devices.updateSource(source.id, { name: value.trim() })
}
</script>

<template>
  <div class="s-scroll sources" data-testid="data-sources">
    <UiSection title="接口数据" :collapsible="false" :count="sources.length">
      <div class="sources__add">
        <button
          v-for="adder in adders"
          :key="adder.type"
          class="s-btn s-btn--sm"
          :data-testid="`add-source-${adder.type}`"
          @click="session.devices.addSource(adder.type)"
        >
          <Plus :size="12" />{{ adder.label }}
        </button>
      </div>
      <p v-if="session.ui.dataError" class="sources__error">{{ session.ui.dataError }}</p>
      <p v-if="!sources.length" class="s-hint sources__hint">
        数据接口决定对象上的数值从哪里来。没有后端接口时，用静态数据手填就能看效果。
      </p>
    </UiSection>

    <UiSection v-for="source in sources" :key="source.id" :title="source.name">
      <template #actions>
        <span class="s-badge" :class="{ 's-badge--ok': state(source.id)?.status === 'connected' }">
          {{ source.enabled ? (statusLabels[state(source.id)?.status ?? ''] ?? '未启动') : '已停用' }}
        </span>
        <button
          class="s-icon-btn"
          title="删除接口"
          :data-testid="`remove-source-${source.type}`"
          @click="session.devices.removeSource(source.id)"
        >
          <Trash2 :size="12" />
        </button>
      </template>
      <UiRow label="名称"><UiText :model-value="source.name" @commit="setName(source, $event)" /></UiRow>
      <UiRow label="类型"
        ><span class="sources__type">{{ typeLabels[source.type] }}</span></UiRow
      >
      <UiRow label="启用">
        <UiSwitch
          :model-value="source.enabled"
          @update:model-value="session.devices.updateSource(source.id, { enabled: $event })"
        />
      </UiRow>

      <template v-if="source.type !== 'static'">
        <UiRow label="地址">
          <UiText
            :model-value="source.url"
            mono
            :data-testid="`source-url-${source.type}`"
            @commit="setUrl(source, $event)"
          />
        </UiRow>
        <p v-if="urlErrors[source.id]" class="sources__error">{{ urlErrors[source.id] }}</p>
        <p v-if="state(source.id)?.error" class="sources__error">{{ state(source.id)?.error }}</p>
      </template>

      <template v-if="source.type === 'http'">
        <UiRow label="请求方式">
          <select
            class="s-select"
            :value="source.method"
            @change="
              session.devices.updateSource(source.id, {
                method: ($event.target as HTMLSelectElement).value as 'GET' | 'POST',
              })
            "
          >
            <option value="GET">GET</option>
            <option value="POST">POST</option>
          </select>
        </UiRow>
        <UiRow label="间隔（秒）">
          <UiNumber
            :model-value="source.interval"
            :step="1"
            :precision="0"
            :min="1"
            :max="3600"
            @update="session.devices.updateSource(source.id, { interval: Math.round($event) })"
          />
        </UiRow>
        <UiRow label="结果位置" hint="设备数据在返回值里的位置，如 data.list；留空是整个返回值">
          <UiText
            :model-value="source.resultPath"
            mono
            placeholder="data"
            @commit="session.devices.updateSource(source.id, { resultPath: $event.trim() })"
          />
        </UiRow>
      </template>

      <template v-if="source.type === 'static'">
        <p v-if="!doc.bindings.length" class="s-hint sources__hint">选中对象、填上设备编号后，它的变量就会列在这里。</p>
        <div v-for="binding in doc.bindings" :key="binding.id" class="static">
          <div class="static__device">{{ binding.device.name }} · {{ binding.device.id }}</div>
          <p v-if="!binding.variables.length" class="s-hint">这台设备还没有变量。</p>
          <UiRow v-for="variable in binding.variables" :key="variable.id" :label="variable.name || variable.key">
            <StaticValueInput :device-id="binding.device.id" :variable="variable" />
            <span v-if="variable.unit" class="static__unit">{{ variable.unit }}</span>
          </UiRow>
        </div>
      </template>
    </UiSection>
  </div>
</template>

<style scoped>
.sources {
  flex: 1;
}
.sources__add {
  display: flex;
  gap: 6px;
  padding: 2px 12px 10px;
}
.sources__hint {
  margin: 0;
  padding: 0 12px 10px;
}
.sources__error {
  margin: 0;
  padding: 2px 12px 6px;
  color: var(--s-danger);
  font-size: 11.5px;
}
.sources__type {
  color: var(--s-fg-2);
}
.static {
  padding-bottom: 6px;
}
.static__device {
  padding: 6px 12px 2px;
  color: var(--s-fg-2);
  font-size: 11.5px;
  font-weight: 600;
}
.static .s-hint {
  margin: 0;
  padding: 0 12px;
}
.static__unit {
  flex: none;
  color: var(--s-fg-3);
  font-size: 11px;
}
</style>
