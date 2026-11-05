<script setup lang="ts">
/** 选中对象时右栏的「数据」页签：绑定设备、变量、当前值；多选时批量绑定。 */
import { Plus, Radio, Trash2, Unlink } from 'lucide-vue-next'
import { computed, ref } from 'vue'
import { newId, type SceneNodeV2, type TwinVariableDefinition } from '@twin-studio/core'
import UiRow from '@/components/ui/UiRow.vue'
import UiSection from '@/components/ui/UiSection.vue'
import UiText from '@/components/ui/UiText.vue'
import { useSession } from '@/studio/context'
import { deviceIdFor, deviceTemplates, deviceVariables } from '@/studio/deviceTemplates'
import { useShell } from '@/studio/shell'
import StaticValueInput from './StaticValueInput.vue'

const props = defineProps<{ nodes: SceneNodeV2[] }>()
const session = useSession()
const shell = useShell()
const node = computed(() => (props.nodes.length === 1 ? props.nodes[0]! : null))
const binding = computed(() => {
  void session.doc.value
  return node.value ? session.devices.bindingFor(node.value.id) : undefined
})
const templateId = ref(deviceTemplates[0]!.id)
/** 现在有值的变量数。 */
const live = computed(() => {
  void session.twin.runtimeRevision
  const current = binding.value
  return current ? current.variables.filter(item => session.twin.getRuntimeValue(current.id, item.key)).length : 0
})
const connected = computed(() => live.value > 0)
/** 这台设备的数据由哪些接口提供。 */
const providers = computed(() => {
  const current = binding.value
  if (!current) return []
  const list = current.variables.flatMap(variable => session.devices.providersOf(current.device.id, variable.key))
  return [...new Set(list.map(source => source.name))]
})
const sourceLabel = computed(() => {
  if (!providers.value.length) return '没有接口提供这台设备'
  return connected.value ? providers.value.join('、') : `等待 ${providers.value.join('、')}`
})
/** 这个变量由静态数据提供时，值可以直接在这里改。 */
const staticSource = (key: string) =>
  binding.value ? session.devices.staticSourceFor(binding.value.device.id, key) : undefined
const editable = computed(() => binding.value?.variables.some(variable => staticSource(variable.key)) ?? false)
const boundCount = computed(() => props.nodes.filter(item => session.devices.bindingFor(item.id)).length)

function bind(): void {
  const n = node.value
  const template = deviceTemplates.find(item => item.id === templateId.value)
  if (!n || !template) return
  const used = new Set(session.doc.value.bindings.map(item => item.device.id))
  let index = 1
  while (used.has(deviceIdFor(template.prefix, index))) index++
  session.devices.setBinding(n.id, {
    device: { id: deviceIdFor(template.prefix, index), name: n.name, type: template.type },
    variables: deviceVariables(template),
  })
}

function updateDevice(field: 'id' | 'name' | 'type', value: string): void {
  const n = node.value
  const current = binding.value
  if (!n || !current) return
  const trimmed = value.trim()
  if (field === 'id' && !trimmed) return
  session.devices.setBinding(n.id, { device: { ...current.device, [field]: trimmed }, variables: current.variables })
}

function updateVariable(index: number, patch: Partial<TwinVariableDefinition>): void {
  const n = node.value
  const current = binding.value
  if (!n || !current) return
  const variables = current.variables.map((variable, at) => (at === index ? { ...variable, ...patch } : variable))
  session.devices.setBinding(n.id, { device: current.device, variables })
}

function addVariable(): void {
  const n = node.value
  const current = binding.value
  if (!n || !current) return
  const key = `value${current.variables.length + 1}`
  session.devices.setBinding(n.id, {
    device: current.device,
    variables: [...current.variables, { id: newId('variable'), key, name: '新变量', dataType: 'number' }],
  })
}

function removeVariable(index: number): void {
  const n = node.value
  const current = binding.value
  if (!n || !current) return
  session.devices.setBinding(n.id, {
    device: current.device,
    variables: current.variables.filter((_, at) => at !== index),
  })
}
</script>

<template>
  <div data-testid="node-data">
    <template v-if="nodes.length > 1">
      <UiSection title="批量绑定设备">
        <p class="data__note s-hint">
          为已选的 {{ nodes.length }} 个对象各绑定一台设备，设备编号自动递增（如 ESS-001、ESS-002…）。其中
          {{ boundCount }} 个已有绑定，将被覆盖。
        </p>
        <div class="data__actions">
          <button class="s-btn s-btn--primary" data-testid="open-batch-bind" @click="shell.dialog = 'batch-bind'">
            <Radio :size="13" />批量绑定…
          </button>
        </div>
      </UiSection>
    </template>

    <template v-else-if="node && !binding">
      <UiSection title="设备绑定">
        <div class="s-empty">
          <Radio :size="22" />
          <span>此对象还没有绑定设备</span>
          <span class="s-hint">绑定后，数据接口的数值会显示在信息面板上，并在点击时交给数据大屏</span>
        </div>
        <UiRow label="设备类型">
          <select v-model="templateId" class="s-select" data-testid="bind-template">
            <option v-for="template in deviceTemplates" :key="template.id" :value="template.id">
              {{ template.name }}（{{ template.variables.length }} 个变量）
            </option>
          </select>
        </UiRow>
        <div class="data__actions">
          <button class="s-btn s-btn--primary" data-testid="bind-device" @click="bind">
            <Plus :size="13" />绑定设备
          </button>
        </div>
      </UiSection>
    </template>

    <template v-else-if="node && binding">
      <UiSection title="设备">
        <template #actions>
          <button class="s-icon-btn" title="解除绑定" @click="session.devices.removeBinding(node.id)">
            <Unlink :size="13" />
          </button>
        </template>
        <UiRow label="设备编号" hint="与数据接口返回的 deviceId 一致">
          <UiText :model-value="binding.device.id" mono data-testid="device-id" @commit="updateDevice('id', $event)" />
        </UiRow>
        <UiRow label="设备名称">
          <UiText :model-value="binding.device.name" @commit="updateDevice('name', $event)" />
        </UiRow>
        <UiRow label="类型">
          <UiText :model-value="binding.device.type ?? ''" mono @commit="updateDevice('type', $event)" />
        </UiRow>
        <UiRow label="数据">
          <span class="s-badge" :class="connected ? 's-badge--ok' : 's-badge--warn'">
            <span class="s-dot" />{{ sourceLabel }}
          </span>
        </UiRow>
      </UiSection>

      <UiSection title="变量" :count="binding.variables.length">
        <template #actions>
          <button class="s-icon-btn" title="添加变量" data-testid="add-variable" @click="addVariable">
            <Plus :size="13" />
          </button>
        </template>
        <div class="vars">
          <div class="vars__head">
            <span>键</span><span>名称</span><span>类型</span><span>单位</span
            ><span>{{ editable ? '值' : '实时值' }}</span
            ><span />
          </div>
          <div v-for="(variable, index) in binding.variables" :key="variable.id" class="vars__row">
            <UiText
              :model-value="variable.key"
              mono
              @commit="updateVariable(index, { key: $event.trim() || variable.key })"
            />
            <UiText :model-value="variable.name" @commit="updateVariable(index, { name: $event })" />
            <select
              class="s-select"
              :value="variable.dataType"
              @change="
                updateVariable(index, {
                  dataType: ($event.target as HTMLSelectElement).value as TwinVariableDefinition['dataType'],
                })
              "
            >
              <option value="number">数值</option>
              <option value="boolean">布尔</option>
              <option value="string">文本</option>
            </select>
            <UiText :model-value="variable.unit ?? ''" @commit="updateVariable(index, { unit: $event || undefined })" />
            <StaticValueInput
              v-if="staticSource(variable.key)"
              :data-type="variable.dataType"
              :value="staticSource(variable.key)!.values[binding.device.id]?.[variable.key]"
              :testid="`node-static-${variable.key}`"
              @commit="
                session.devices.setStaticValue(staticSource(variable.key)!.id, binding.device.id, variable.key, $event)
              "
            />
            <span v-else class="vars__value s-mono" :class="{ 'is-live': connected }">{{
              session.devices.liveValue(binding.id, variable.key)
            }}</span>
            <button class="s-icon-btn" title="删除变量" @click="removeVariable(index)"><Trash2 :size="12" /></button>
          </div>
        </div>
        <p class="data__note s-hint">
          接口数据示例：<code class="s-mono"
            >{"deviceId":"{{ binding.device.id }}","{{ binding.variables[0]?.key ?? 'value' }}":42}</code
          >
        </p>
      </UiSection>
    </template>
  </div>
</template>

<style scoped>
.data__note {
  margin: 0;
  padding: 2px 12px 8px;
}
.data__note code {
  color: var(--s-fg-2);
  word-break: break-all;
}
.data__actions {
  display: flex;
  justify-content: flex-end;
  padding: 6px 12px 0;
}
.vars {
  padding: 0 8px;
}
.vars__head,
.vars__row {
  display: grid;
  grid-template-columns: 1.1fr 1.2fr 0.9fr 0.7fr 0.9fr 22px;
  align-items: center;
  gap: 3px;
}
.vars__head {
  padding: 0 2px 4px;
  color: var(--s-fg-3);
  font-size: 10.5px;
}
.vars__row {
  margin-bottom: 3px;
}
.vars__row :deep(.s-input),
.vars__row .s-select {
  height: 24px;
  padding: 0 5px;
  font-size: 11px;
}
.vars__row .s-select {
  padding-right: 16px;
  background-position: right 5px center;
}
.vars__value {
  overflow: hidden;
  color: var(--s-fg-3);
  text-align: right;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.vars__value.is-live {
  color: var(--s-data);
}
</style>
