<script setup lang="ts">
/** 选中一个节点时的右栏：基本属性、变换、设备数据、数据面板。 */
import { computed } from 'vue'
import { formatRuntimeValue, type SceneNodeV2, type SceneTransform } from '@twin-studio/core'
import { Plus, X } from 'lucide-vue-next'
import UiNumber from '@/components/ui/UiNumber.vue'
import UiRow from '@/components/ui/UiRow.vue'
import UiSection from '@/components/ui/UiSection.vue'
import UiSwitch from '@/components/ui/UiSwitch.vue'
import UiText from '@/components/ui/UiText.vue'
import { useSession } from '@/studio/context'
import StaticValueInput from './StaticValueInput.vue'

const props = defineProps<{ node: SceneNodeV2 }>()
const session = useSession()
const axes = ['X', 'Y', 'Z'] as const
const axisColors = ['#e5534b', '#57ab5a', '#539bf5']
const DEGREES = 180 / Math.PI

const rows: Array<{ key: keyof SceneTransform; label: string; factor: number; step: number; precision: number }> = [
  { key: 'position', label: '位置', factor: 1, step: 0.1, precision: 2 },
  { key: 'rotation', label: '旋转', factor: DEGREES, step: 1, precision: 1 },
  { key: 'scale', label: '缩放', factor: 1, step: 0.01, precision: 3 },
]

const binding = computed(() => session.devices.bindingOf(props.node.id))
const panel = computed(() => session.panels.instanceOn(props.node.id))
const templates = computed(() => session.doc.value.panelTemplates)
const dataTypes = [
  { value: 'number', label: '数值' },
  { value: 'string', label: '文本' },
  { value: 'boolean', label: '开关' },
] as const

/** 当前收到的值（来自任何数据接口）。读 runtimeRevision，数值变了会跟着刷新。 */
function liveValue(key: string, unit?: string): string {
  void session.twin.runtimeRevision
  const id = binding.value?.id
  return formatRuntimeValue(id ? session.twin.getRuntimeValue(id, key)?.value : undefined, unit)
}

function bind(deviceId: string): void {
  const id = deviceId.trim()
  if (id) session.devices.setDevice(props.node.id, { id, name: binding.value?.device.name || props.node.name })
}

function rename(name: string): void {
  const device = binding.value?.device
  if (device) session.devices.setDevice(props.node.id, { id: device.id, name: name.trim() || props.node.name })
}

function setTemplate(event: Event): void {
  const templateId = (event.target as HTMLSelectElement).value
  if (templateId) session.panels.addInstances(templateId, [props.node.id])
  else if (panel.value) session.panels.removeInstances([panel.value.id])
}
</script>

<template>
  <div class="s-scroll node" data-testid="node-inspector">
    <UiSection title="基本">
      <UiRow label="名称">
        <UiText :model-value="node.name" data-testid="node-name" @commit="session.nodes.rename(node.id, $event)" />
      </UiRow>
      <UiRow label="显示">
        <UiSwitch :model-value="node.visible" @update:model-value="session.nodes.setVisible(node.id, $event)" />
      </UiRow>
      <UiRow label="锁定">
        <UiSwitch :model-value="node.locked" @update:model-value="session.nodes.setLocked(node.id, $event)" />
      </UiRow>
    </UiSection>

    <UiSection title="变换">
      <UiRow v-for="row in rows" :key="row.key" :label="row.label">
        <UiNumber
          v-for="(axis, index) in axes"
          :key="axis"
          :model-value="node.transform[row.key][index]! * row.factor"
          :label="axis"
          :label-color="axisColors[index]"
          :step="row.step"
          :precision="row.precision"
          :data-testid="`${row.key}-${axis}`"
          @update="session.nodes.setTransformValue(node.id, row.key, index, $event / row.factor)"
          @commit="session.commit()"
        />
      </UiRow>
    </UiSection>

    <UiSection title="设备数据">
      <UiRow label="设备编号">
        <UiText
          :model-value="binding?.device.id ?? ''"
          placeholder="例如 ESS-001"
          data-testid="device-id"
          @commit="bind"
        />
        <button
          v-if="binding"
          class="s-icon-btn"
          title="解除绑定"
          data-testid="unbind-device"
          @click="session.devices.removeDevice(node.id)"
        >
          <X :size="12" />
        </button>
      </UiRow>
      <template v-if="binding">
        <UiRow label="设备名称">
          <UiText :model-value="binding.device.name" @commit="rename" />
        </UiRow>
        <div class="vars">
          <div v-for="variable in binding.variables" :key="variable.id" class="var">
            <div class="var__line">
              <UiText
                :model-value="variable.name"
                placeholder="名称"
                @commit="session.devices.updateVariable(node.id, variable.id, { name: $event })"
              />
              <UiText
                :model-value="variable.key"
                placeholder="变量名"
                mono
                @commit="session.devices.updateVariable(node.id, variable.id, { key: $event.trim() })"
              />
              <button class="s-icon-btn" title="删除变量" @click="session.devices.removeVariable(node.id, variable.id)">
                <X :size="12" />
              </button>
            </div>
            <div class="var__line">
              <select
                class="s-select"
                :value="variable.dataType"
                @change="
                  session.devices.updateVariable(node.id, variable.id, {
                    dataType: ($event.target as HTMLSelectElement).value as typeof variable.dataType,
                  })
                "
              >
                <option v-for="type in dataTypes" :key="type.value" :value="type.value">{{ type.label }}</option>
              </select>
              <UiText
                :model-value="variable.unit ?? ''"
                placeholder="单位"
                @commit="session.devices.updateVariable(node.id, variable.id, { unit: $event.trim() })"
              />
            </div>
            <div class="var__line">
              <span class="var__label">静态值</span>
              <StaticValueInput :device-id="binding.device.id" :variable="variable" />
              <span class="var__live" title="当前收到的值">{{ liveValue(variable.key, variable.unit) }}</span>
            </div>
          </div>
          <button class="s-btn s-btn--sm" data-testid="add-variable" @click="session.devices.addVariable(node.id)">
            <Plus :size="12" />添加变量
          </button>
        </div>
      </template>
      <p v-else class="s-hint node__hint">填上设备编号，这个对象就能接收这台设备的数据。</p>
    </UiSection>

    <UiSection title="数据面板">
      <UiRow label="面板模板">
        <select class="s-select" :value="panel?.templateId ?? ''" data-testid="node-template" @change="setTemplate">
          <option value="">不显示面板</option>
          <option v-for="template in templates" :key="template.id" :value="template.id">{{ template.name }}</option>
        </select>
      </UiRow>
      <UiRow v-if="panel" label="标题覆盖">
        <UiText
          :model-value="panel.title ?? ''"
          placeholder="跟随模板"
          @commit="session.panels.setInstanceTitle(panel!.id, $event)"
        />
      </UiRow>
      <p v-if="!templates.length" class="s-hint node__hint">在左栏「面板」里新建模板后，这里就能选了。</p>
    </UiSection>
  </div>
</template>

<style scoped>
.node {
  flex: 1;
}
.node__hint {
  margin: 0;
  padding: 2px 12px 10px;
}
.vars {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 6px 12px 10px;
}
.var {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 6px;
  border: 1px solid var(--s-line);
  border-radius: 6px;
}
.var__line {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 4px;
}
.var__line > * {
  min-width: 0;
  flex: 1;
}
.var__line > .s-icon-btn {
  flex: none;
}
.var__label {
  flex: none;
  color: var(--s-fg-3);
  font-size: 11px;
}
.var__live {
  flex: none;
  color: var(--s-accent-2);
  font-size: 11.5px;
  font-weight: 600;
  white-space: nowrap;
}
</style>
