<script setup lang="ts">
/**
 * 涉及设备：这个接口提供哪些设备、每台设备的哪些变量。
 *   全部设备   返回数据里出现的已绑定设备都接收（不写 devices 字段）
 *   指定设备   只接收列出的设备；每台还可以只勾部分变量，这样一台设备的不同变量可以来自不同接口
 * 设备来自对象上的绑定；没绑定的设备不在这里新建，试请求会提示返回里有哪些设备还没绑定。
 */
import { ChevronRight, X } from 'lucide-vue-next'
import { computed, ref } from 'vue'
import { type ActiveDataSourceConfig, sourceProvides, type SourceDevice } from '@twin-studio/core'
import UiSection from '@/components/ui/UiSection.vue'
import UiSegmented from '@/components/ui/UiSegmented.vue'
import { useSession } from '@/studio/context'

const props = defineProps<{ source: ActiveDataSourceConfig; matched?: readonly string[] }>()
const session = useSession()
const all = computed(() => session.devices.devices)
const chosen = computed(() => props.source.devices)
const mode = computed<'all' | 'some'>(() => (chosen.value ? 'some' : 'all'))
const modes = [
  { value: 'all' as const, label: '全部设备', title: '返回数据里出现的已绑定设备都接收' },
  { value: 'some' as const, label: '指定设备', title: '只接收列出的设备' },
]
const update = (devices: SourceDevice[] | undefined) => session.devices.updateSource(props.source.id, { devices })

function setMode(next: 'all' | 'some'): void {
  if (next === 'all') update(undefined)
  else update(chosen.value ?? [])
}

const rows = computed(() =>
  (chosen.value ?? []).map(item => ({ item, device: all.value.find(device => device.id === item.deviceId) })),
)
const remaining = computed(() => all.value.filter(device => !chosen.value?.some(item => item.deviceId === device.id)))
/** 试请求返回里出现、但还没加进来的设备。 */
const fromProbe = computed(() =>
  (props.matched ?? []).filter(
    id => remaining.value.some(device => device.id === id) && !chosen.value?.some(item => item.deviceId === id),
  ),
)

const add = (ids: readonly string[]) =>
  update([...(chosen.value ?? []).map(item => ({ ...item })), ...ids.map(deviceId => ({ deviceId }))])
const remove = (id: string) => update(chosen.value?.filter(item => item.deviceId !== id).map(item => ({ ...item })))

/** 勾选或取消一个变量。全部勾上时不写 variables，以后设备新增变量也能收到。 */
function toggleVariable(item: SourceDevice, key: string): void {
  const device = all.value.find(entry => entry.id === item.deviceId)
  if (!device) return
  const current = device.variables.map(v => v.key).filter(k => sourceProvides(props.source, item.deviceId, k))
  const next = current.includes(key) ? current.filter(k => k !== key) : [...current, key]
  update(
    chosen.value?.map(entry =>
      entry.deviceId === item.deviceId
        ? { deviceId: entry.deviceId, variables: next.length === device.variables.length ? undefined : next }
        : { ...entry },
    ),
  )
}

const expanded = ref(new Set<string>())
function toggleRow(id: string): void {
  const next = new Set(expanded.value)
  if (!next.delete(id)) next.add(id)
  expanded.value = next
}
</script>

<template>
  <UiSection
    title="涉及设备"
    nested
    :count="chosen ? chosen.length : all.length"
    :open="false"
    data-testid="source-devices"
  >
    <div class="devices__mode">
      <UiSegmented
        :model-value="mode"
        :options="modes"
        data-testid="source-device-mode"
        @update:model-value="setMode"
      />
    </div>
    <p v-if="mode === 'all'" class="devices__note s-hint">
      返回数据里出现的已绑定设备都会接收（本场景共 {{ all.length }} 台）。一台设备的数据来自多个接口时，请改为指定设备。
    </p>

    <template v-else>
      <div v-for="{ item, device } in rows" :key="item.deviceId" class="device">
        <div class="device__head" @click="toggleRow(item.deviceId)">
          <ChevronRight :size="12" class="device__chevron" :class="{ 'is-open': expanded.has(item.deviceId) }" />
          <span class="device__name">{{ device?.name || item.deviceId }}</span>
          <small v-if="device" class="s-mono">{{ item.deviceId }}</small>
          <small v-else class="device__missing">未绑定</small>
          <small v-if="device" class="device__count">
            {{ item.variables ? item.variables.length : device.variables.length }}/{{ device.variables.length }}
          </small>
          <button class="s-icon-btn" title="从此接口移除" @click.stop="remove(item.deviceId)"><X :size="12" /></button>
        </div>
        <div v-if="device && expanded.has(item.deviceId)" class="device__vars">
          <label v-for="variable in device.variables" :key="variable.key">
            <input
              type="checkbox"
              :checked="sourceProvides(source, item.deviceId, variable.key)"
              :data-testid="`source-var-${item.deviceId}-${variable.key}`"
              @change="toggleVariable(item, variable.key)"
            />
            <span :title="variable.key">{{ variable.name || variable.key }}</span>
          </label>
        </div>
      </div>

      <div class="devices__add">
        <select
          class="s-select"
          :disabled="!remaining.length"
          data-testid="source-add-device"
          @change="
            (add([($event.target as HTMLSelectElement).value]), (($event.target as HTMLSelectElement).value = ''))
          "
        >
          <option value="">{{ remaining.length ? '添加设备…' : '场景里的设备都已添加' }}</option>
          <option v-for="device in remaining" :key="device.id" :value="device.id">
            {{ device.name || device.id }}（{{ device.id }}）
          </option>
        </select>
        <button class="s-btn s-btn--sm" :disabled="!remaining.length" @click="add(remaining.map(device => device.id))">
          全部添加
        </button>
      </div>
      <button v-if="fromProbe.length" class="devices__probe s-btn s-btn--sm" @click="add(fromProbe)">
        添加试请求返回的 {{ fromProbe.length }} 台设备
      </button>
    </template>
  </UiSection>
</template>

<style scoped>
.devices__mode {
  display: flex;
  padding: 0 12px 6px;
}
.devices__note {
  margin: 0;
  padding: 0 12px;
}
.device {
  margin: 0 8px 3px;
  border: 1px solid var(--s-line);
  border-radius: 5px;
  background: var(--s-panel-2);
}
.device__head {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 5px;
  padding: 3px 4px 3px 6px;
  cursor: pointer;
}
.device__chevron {
  flex-shrink: 0;
  color: var(--s-fg-3);
  transition: transform 140ms ease;
}
.device__chevron.is-open {
  transform: rotate(90deg);
}
.device__name {
  overflow: hidden;
  font-size: 11.5px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.device__head small {
  flex-shrink: 0;
  color: var(--s-fg-3);
  font-size: 10.5px;
}
.device__head .device__missing {
  color: var(--s-warn);
}
.device__head .device__count {
  margin-left: auto;
}
.device__head .s-icon-btn {
  width: 20px;
  height: 20px;
  flex-shrink: 0;
}
.device__vars {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 2px 8px;
  padding: 2px 8px 6px 22px;
}
.device__vars label {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 4px;
  color: var(--s-fg-2);
  font-size: 11px;
  cursor: pointer;
}
.device__vars span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.devices__add {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px 0;
}
.devices__add .s-select {
  min-width: 0;
  flex: 1;
}
.devices__add .s-btn {
  flex-shrink: 0;
}
.devices__probe {
  margin: 4px 8px 0;
}
</style>
