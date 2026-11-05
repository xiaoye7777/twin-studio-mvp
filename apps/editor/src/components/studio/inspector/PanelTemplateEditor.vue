<script setup lang="ts">
/**
 * 面板模板，结构和预制体一样：上半部分编辑模板（改了所有实例一起变），下半部分批量管理实例。
 * 实例只记录和模板不同的地方；有覆盖的实例可以一键恢复。
 */
import { ChevronRight, Plus, RotateCcw, Trash2, X } from 'lucide-vue-next'
import { computed, ref } from 'vue'
import type { PanelInstance, PanelTemplate } from '@twin-studio/core'
import UiNumber from '@/components/ui/UiNumber.vue'
import UiRow from '@/components/ui/UiRow.vue'
import UiSection from '@/components/ui/UiSection.vue'
import UiText from '@/components/ui/UiText.vue'
import { confirmAction } from '@/components/ui/confirm'
import { useSession } from '@/studio/context'
import { useShell } from '@/studio/shell'

const props = defineProps<{ template: PanelTemplate }>()
const session = useSession()
const shell = useShell()
const panels = session.panels
const instances = computed(() => panels.instancesOf(props.template.id))
const expanded = ref<string | null>(null)
const prefix = ref('ESS-')
const start = ref(1)

/** 场景里的模型按模型文件分组：一次给同一种模型全部挂上。 */
const modelGroups = computed(() => {
  const groups = new Map<string, { assetId: string; label: string; nodeIds: string[] }>()
  for (const node of session.doc.value.nodes) {
    if (node.kind !== 'model') continue
    const group = groups.get(node.model.assetId)
    if (group) group.nodeIds.push(node.id)
    else groups.set(node.model.assetId, { assetId: node.model.assetId, label: node.name, nodeIds: [node.id] })
  }
  return [...groups.values()]
})
/** 还没挂这个模板的模型。 */
const available = computed(() =>
  session.doc.value.nodes.filter(
    node => node.kind === 'model' && !instances.value.some(panel => panel.nodeId === node.id),
  ),
)
const picked = ref<string[]>([])

function addPicked(): void {
  panels.addInstances(props.template.id, picked.value)
  picked.value = []
}

function nodeName(panel: PanelInstance): string {
  return session.node(panel.nodeId)?.name ?? '（已删除）'
}

function deviceId(panel: PanelInstance): string {
  return session.devices.bindingOf(panel.nodeId)?.device.id ?? ''
}

function hasOverride(panel: PanelInstance): boolean {
  return panel.title !== undefined || !!panel.hiddenFields?.length
}

async function removeTemplate(): Promise<void> {
  const count = instances.value.length
  const message = count
    ? `删除模板「${props.template.name}」和它的 ${count} 个实例？`
    : `删除模板「${props.template.name}」？`
  if (!(await confirmAction(message, { title: '删除面板模板', confirm: '删除', danger: true }))) return
  panels.removeTemplate(props.template.id)
  shell.templateId = null
}
</script>

<template>
  <div class="s-scroll editor" data-testid="template-editor">
    <UiSection title="面板模板" :collapsible="false">
      <template #actions>
        <button class="s-icon-btn" title="删除模板" data-testid="remove-template" @click="removeTemplate">
          <Trash2 :size="12" />
        </button>
      </template>
      <UiRow label="模板名称">
        <UiText
          :model-value="template.name"
          data-testid="template-name"
          @commit="panels.updateTemplate(template.id, { name: $event.trim() || template.name })"
        />
      </UiRow>
      <UiRow label="面板标题" hint="留空时用设备名，没有设备就用对象名">
        <UiText
          :model-value="template.title"
          placeholder="留空用设备名"
          @commit="panels.updateTemplate(template.id, { title: $event.trim() })"
        />
      </UiRow>
    </UiSection>

    <UiSection title="字段" :count="template.fields.length">
      <template #actions>
        <button class="s-icon-btn" title="添加字段" data-testid="add-field" @click="panels.addField(template.id)">
          <Plus :size="12" />
        </button>
      </template>
      <div class="fields">
        <div class="field field--head"><span>显示名</span><span>变量名</span><span>单位</span><span /></div>
        <div v-for="field in template.fields" :key="field.id" class="field" :data-testid="`field-${field.variableKey}`">
          <UiText :model-value="field.label" @commit="panels.updateField(template.id, field.id, { label: $event })" />
          <UiText
            :model-value="field.variableKey"
            mono
            @commit="panels.updateField(template.id, field.id, { variableKey: $event.trim() })"
          />
          <UiText
            :model-value="field.unit ?? ''"
            @commit="panels.updateField(template.id, field.id, { unit: $event.trim() })"
          />
          <button class="s-icon-btn" title="删除字段" @click="panels.removeField(template.id, field.id)">
            <X :size="12" />
          </button>
        </div>
      </div>
    </UiSection>

    <UiSection title="实例" :count="instances.length">
      <div class="add">
        <div class="add__title">批量添加</div>
        <div class="add__groups">
          <button
            v-for="group in modelGroups"
            :key="group.assetId"
            class="s-btn s-btn--sm"
            :title="`给 ${group.nodeIds.length} 个同样的模型全部挂上这个模板`"
            :data-testid="`add-group-${group.label}`"
            @click="panels.addInstances(template.id, group.nodeIds)"
          >
            <Plus :size="12" />全部「{{ group.label }}」× {{ group.nodeIds.length }}
          </button>
        </div>
        <template v-if="available.length">
          <div class="add__title">逐个勾选</div>
          <label v-for="node in available" :key="node.id" class="add__pick">
            <input v-model="picked" type="checkbox" :value="node.id" />
            <span>{{ node.name }}</span>
          </label>
          <button class="s-btn s-btn--sm" :disabled="!picked.length" data-testid="add-picked" @click="addPicked">
            添加所选（{{ picked.length }}）
          </button>
        </template>
        <p v-if="!modelGroups.length" class="s-hint">场景里还没有模型。</p>
      </div>

      <template v-if="instances.length">
        <div class="number">
          <span>批量编号</span>
          <input v-model="prefix" class="s-input" placeholder="前缀" data-testid="number-prefix" />
          <UiNumber :model-value="start" :step="1" :precision="0" :min="0" @update="start = Math.round($event)" />
          <button
            class="s-btn s-btn--sm"
            data-testid="number-devices"
            @click="panels.numberDevices(template.id, prefix, start)"
          >
            应用
          </button>
        </div>

        <div v-for="panel in instances" :key="panel.id" class="instance" :data-testid="`instance-${nodeName(panel)}`">
          <div class="instance__head">
            <button
              class="instance__toggle"
              :class="{ 'is-open': expanded === panel.id }"
              title="展开覆盖设置"
              @click="expanded = expanded === panel.id ? null : panel.id"
            >
              <ChevronRight :size="12" />
            </button>
            <button class="instance__name" :title="nodeName(panel)" @click="session.select([panel.nodeId])">
              {{ nodeName(panel) }}
            </button>
            <UiText
              class="instance__device"
              :model-value="deviceId(panel)"
              placeholder="设备编号"
              @commit="panels.setInstanceDevice(panel.id, $event)"
            />
            <button class="s-icon-btn" title="移除实例" @click="panels.removeInstances([panel.id])">
              <X :size="12" />
            </button>
          </div>
          <div v-if="expanded === panel.id" class="instance__body">
            <UiRow label="标题">
              <UiText
                :model-value="panel.title ?? ''"
                placeholder="跟随模板"
                @commit="panels.setInstanceTitle(panel.id, $event)"
              />
            </UiRow>
            <label v-for="field in template.fields" :key="field.id" class="add__pick">
              <input
                type="checkbox"
                :checked="!panel.hiddenFields?.includes(field.id)"
                @change="panels.toggleInstanceField(panel.id, field.id)"
              />
              <span>显示「{{ field.label }}」</span>
            </label>
            <button class="s-btn s-btn--sm" :disabled="!hasOverride(panel)" @click="panels.resetInstance(panel.id)">
              <RotateCcw :size="12" />恢复成模板
            </button>
          </div>
        </div>
      </template>
    </UiSection>
  </div>
</template>

<style scoped>
.editor {
  flex: 1;
}
.fields {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 2px 12px 10px;
}
.field {
  display: grid;
  grid-template-columns: 1fr 1fr 44px 22px;
  align-items: center;
  gap: 4px;
}
.field--head {
  color: var(--s-fg-3);
  font-size: 11px;
}
.add {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  padding: 2px 12px 10px;
}
.add__title {
  margin-top: 2px;
  color: var(--s-fg-3);
  font-size: 11px;
}
.add__groups {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.add__pick {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  cursor: pointer;
}
.add .s-hint {
  margin: 0;
}
.number {
  display: grid;
  grid-template-columns: auto 1fr 56px auto;
  align-items: center;
  gap: 4px;
  padding: 6px 12px;
  border-top: 1px solid var(--s-line);
  color: var(--s-fg-3);
  font-size: 11px;
}
.number .s-input {
  min-width: 0;
}
.instance {
  border-top: 1px solid var(--s-line);
}
.instance__head {
  display: grid;
  grid-template-columns: 18px minmax(0, 1fr) 96px 22px;
  align-items: center;
  gap: 4px;
  padding: 4px 12px;
}
.instance__toggle {
  display: grid;
  width: 18px;
  height: 18px;
  place-items: center;
  padding: 0;
  border: 0;
  background: none;
  color: var(--s-fg-3);
  cursor: pointer;
}
.instance__toggle.is-open svg {
  transform: rotate(90deg);
}
.instance__name {
  overflow: hidden;
  padding: 0;
  border: 0;
  background: none;
  color: var(--s-fg);
  cursor: pointer;
  text-align: left;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.instance__name:hover {
  color: var(--s-accent-2);
}
.instance__body {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  padding: 0 12px 10px 34px;
}
.instance__body .ui-row {
  width: 100%;
  padding: 0;
}
</style>
