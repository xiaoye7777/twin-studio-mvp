<script setup lang="ts">
/**
 * 场景的全部设备：一台设备的数据可能来自多个接口，这里合起来看每个变量现在的值、来自哪个接口。
 * 接口里的「涉及设备」是从接口看设备，这里是从设备看接口。
 */
import { ChevronRight, LocateFixed, Radio } from 'lucide-vue-next'
import { computed, ref } from 'vue'
import { targetNodeId, type TwinVariableDefinition } from '@twin-studio/core'
import { useSession } from '@/studio/context'
import type { SceneDevice } from '@/studio/session/DeviceData'
import StaticValueInput from '../StaticValueInput.vue'

const session = useSession()
const twin = session.twin
const search = ref('')
const expanded = ref(new Set<string>())
function toggle(id: string): void {
  const next = new Set(expanded.value)
  if (!next.delete(id)) next.add(id)
  expanded.value = next
}

const sourceName = (id: string | undefined) => (id ? session.devices.source(id)?.name : undefined)
const bindingOf = (device: SceneDevice, key: string) =>
  device.bindings.find(binding => binding.variables.some(variable => variable.key === key))!
const ownerOf = (device: SceneDevice, key: string) => twin.getRuntimeValue(bindingOf(device, key).id, key)?.sourceId

const rows = computed(() => {
  void twin.runtimeRevision
  const keyword = search.value.trim().toLowerCase()
  return session.devices.devices
    .filter(device => !keyword || `${device.name} ${device.id}`.toLowerCase().includes(keyword))
    .map(device => {
      const owners = device.variables.flatMap(variable => ownerOf(device, variable.key) ?? [])
      const hasProvider = device.variables.some(variable => session.devices.providersOf(device.id, variable.key).length)
      return {
        device,
        live: owners.length,
        sources: [...new Set(owners)].flatMap(id => sourceName(id) ?? []),
        hasProvider,
      }
    })
})
const total = computed(() => session.devices.devices.length)

function nodesOf(device: SceneDevice) {
  return device.bindings.map(binding => {
    const id = targetNodeId(binding.target)
    return { id, name: session.node(id)?.name ?? '（对象已删除）' }
  })
}

/** 变量后面显示的来源：现在写入它的接口；没有值时是可能提供它的接口。 */
function variableSource(device: SceneDevice, variable: TwinVariableDefinition): string {
  const owner = sourceName(ownerOf(device, variable.key))
  if (owner) return owner
  const providers = session.devices.providersOf(device.id, variable.key)
  return providers.length ? `等待 ${providers[0]!.name}` : '没有接口提供'
}
</script>

<template>
  <div v-if="!total" class="s-empty">
    <Radio :size="20" />
    <span>还没有绑定设备</span>
    <span class="s-hint">选中对象 →「数据」页签绑定；多选可批量绑定</span>
  </div>
  <template v-else>
    <div v-if="total > 6" class="list__search">
      <input v-model="search" class="s-input" placeholder="搜索设备名称或编号" data-testid="device-search" />
    </div>
    <article v-for="row in rows" :key="row.device.id" class="device" :data-testid="`device-${row.device.id}`">
      <header class="device__head" @click="toggle(row.device.id)">
        <ChevronRight :size="12" class="device__chevron" :class="{ 'is-open': expanded.has(row.device.id) }" />
        <span class="device__dot" :class="{ 'is-live': row.live > 0 }" />
        <span class="device__text">
          <strong>{{ row.device.name || row.device.id }}</strong>
          <small v-if="row.sources.length" :title="row.sources.join('、')">
            <span class="s-mono">{{ row.device.id }}</span> · {{ row.sources.join('、') }}
          </small>
          <small v-else :class="{ 'is-warn': !row.hasProvider }">
            <span class="s-mono">{{ row.device.id }}</span> · {{ row.hasProvider ? '等待数据' : '没有接口提供' }}
          </small>
        </span>
        <span class="s-hint">{{ row.live }}/{{ row.device.variables.length }}</span>
      </header>
      <div v-if="expanded.has(row.device.id)" class="device__body">
        <div class="device__nodes">
          <button
            v-for="node in nodesOf(row.device)"
            :key="node.id"
            class="device__node"
            title="在场景中选中"
            @click="session.select([node.id])"
          >
            <LocateFixed :size="11" />{{ node.name }}
          </button>
        </div>
        <div v-for="variable in row.device.variables" :key="variable.key" class="variable">
          <span class="variable__name" :title="variable.key">{{ variable.name || variable.key }}</span>
          <StaticValueInput
            v-if="session.devices.staticSourceFor(row.device.id, variable.key)"
            :data-type="variable.dataType"
            :value="session.devices.staticSourceFor(row.device.id, variable.key)!.values[row.device.id]?.[variable.key]"
            :testid="`static-${row.device.id}-${variable.key}`"
            @commit="
              session.devices.setStaticValue(
                session.devices.staticSourceFor(row.device.id, variable.key)!.id,
                row.device.id,
                variable.key,
                $event,
              )
            "
          />
          <span v-else class="variable__value s-mono">{{
            session.devices.liveValue(bindingOf(row.device, variable.key).id, variable.key)
          }}</span>
          <small class="variable__source" :title="variableSource(row.device, variable)">
            {{ variableSource(row.device, variable) }}
          </small>
        </div>
      </div>
    </article>
    <p v-if="!rows.length" class="list__note s-hint">没有匹配的设备</p>
  </template>
</template>

<style scoped>
.list__search {
  padding: 0 8px 6px;
}
.list__note {
  margin: 0;
  padding: 4px 12px;
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
  gap: 6px;
  padding: 5px 8px 5px 6px;
  cursor: pointer;
}
.device:hover {
  border-color: var(--s-accent-line);
}
.device__chevron {
  flex-shrink: 0;
  color: var(--s-fg-3);
  transition: transform 140ms ease;
}
.device__chevron.is-open {
  transform: rotate(90deg);
}
.device__dot {
  width: 7px;
  height: 7px;
  flex-shrink: 0;
  border-radius: 50%;
  background: var(--s-fg-4);
}
.device__dot.is-live {
  background: var(--s-ok);
  box-shadow: 0 0 6px color-mix(in srgb, var(--s-ok) 70%, transparent);
}
.device__text {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
}
.device__text strong,
.device__text small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.device__text strong {
  font-weight: 500;
}
.device__text small {
  color: var(--s-fg-3);
  font-size: 10.5px;
}
.device__text small.is-warn {
  color: var(--s-warn);
}
.device__body {
  padding: 4px 8px 8px;
  border-top: 1px solid var(--s-line);
}
.device__nodes {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  padding-bottom: 4px;
}
.device__node {
  display: inline-flex;
  max-width: 100%;
  align-items: center;
  gap: 3px;
  overflow: hidden;
  padding: 1px 6px;
  border: 1px solid var(--s-line-2);
  border-radius: 10px;
  background: none;
  color: var(--s-fg-2);
  font-size: 10.5px;
  white-space: nowrap;
  cursor: pointer;
}
.device__node:hover {
  border-color: var(--s-accent-line);
  color: var(--s-fg);
}
.variable {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 72px minmax(0, 1fr);
  align-items: center;
  gap: 6px;
  min-height: 24px;
  font-size: 11px;
}
.variable__name,
.variable__source {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.variable__name {
  color: var(--s-fg-2);
}
.variable__value {
  overflow: hidden;
  color: var(--s-data);
  text-align: right;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.variable__source {
  color: var(--s-fg-3);
  font-size: 10.5px;
}
</style>
