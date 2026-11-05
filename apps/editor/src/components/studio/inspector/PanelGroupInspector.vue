<script setup lang="ts">
/**
 * 选中标签组时的右栏，结构和预制体一样：添加子元素（在场景里点击放置面板）、模板配置（改了所有面板一起变）、
 * 批量管理下面的面板。
 */
import { MousePointerClick, Plus, X } from 'lucide-vue-next'
import { computed, ref } from 'vue'
import type { PanelGroupNodeV2, PanelTemplate } from '@twin-studio/core'
import UiNumber from '@/components/ui/UiNumber.vue'
import UiRow from '@/components/ui/UiRow.vue'
import UiSection from '@/components/ui/UiSection.vue'
import UiSegmented from '@/components/ui/UiSegmented.vue'
import UiSwitch from '@/components/ui/UiSwitch.vue'
import UiText from '@/components/ui/UiText.vue'
import { useSession } from '@/studio/context'
import { deviceTemplates } from '@/studio/deviceTemplates'

const props = defineProps<{ node: PanelGroupNodeV2 }>()
const session = useSession()
const panels = session.panels
const template = computed(() => props.node.template)
const children = computed(() => panels.children(props.node.id))
const placing = computed(() => session.ui.placing === props.node.id)
const prefix = ref('ESS-')
const start = ref(1)
const triggers: ReadonlyArray<{ value: PanelTemplate['trigger']; label: string; title: string }> = [
  { value: 'always', label: '始终显示', title: '预览和数据大屏里一直显示' },
  { value: 'click', label: '点击显示', title: '点击关联的对象时才显示，点空白处隐藏' },
]

/** 场景里的模型按模型文件分组：一次给同一种模型各放一个面板。 */
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

function deviceOf(panelId: string): string {
  return session.devices.bindingFor(panelId)?.device.id ?? ''
}

function applyDeviceType(event: Event): void {
  const select = event.target as HTMLSelectElement
  const type = deviceTemplates.find(item => item.id === select.value)
  if (type) panels.applyDeviceType(props.node.id, type)
  select.value = ''
}

function togglePlacing(): void {
  if (placing.value) panels.stopPlacing()
  else panels.startPlacing(props.node.id)
}
</script>

<template>
  <div data-testid="panel-group-inspector">
    <UiSection title="基本">
      <UiRow label="名称">
        <UiText :model-value="node.name" data-testid="node-name" @commit="session.nodes.rename(node.id, $event)" />
      </UiRow>
      <UiRow label="显示">
        <UiSwitch :model-value="node.visible" @update:model-value="session.nodes.setVisible([node.id], $event)" />
      </UiRow>
      <UiRow label="锁定">
        <UiSwitch :model-value="node.locked" @update:model-value="session.nodes.setLocked([node.id], $event)" />
      </UiRow>
    </UiSection>

    <div class="add">
      <button
        class="s-btn s-btn--block"
        :class="{ 's-btn--primary': !placing }"
        data-testid="add-child"
        @click="togglePlacing"
      >
        <MousePointerClick :size="13" />{{ placing ? '放置中，点这里结束' : '添加子元素' }}
      </button>
      <p class="s-hint">点按钮后，在场景里用鼠标左键点击，就在那个位置放一个面板。点在模型上会关联这个模型。</p>
    </div>

    <UiSection title="模板配置">
      <UiRow label="标题" hint="留空时用设备名，没有设备就用对象名">
        <UiText
          :model-value="template.title"
          placeholder="留空用设备名"
          data-testid="template-title"
          @commit="panels.updateTemplate(node.id, { title: $event.trim() })"
        />
      </UiRow>
      <UiRow label="宽度" hint="面板在场景里的宽度，单位米；镜头拉远时和物体一样变小">
        <UiNumber
          :model-value="template.width"
          :step="0.1"
          :precision="1"
          :min="0.2"
          :max="200"
          unit="m"
          data-testid="template-width"
          @update="panels.updateTemplate(node.id, { width: $event }, `panel-width:${node.id}`)"
          @commit="session.commit()"
        />
      </UiRow>
      <UiRow label="显示方式" hint="只影响预览和数据大屏；编辑时面板总是显示">
        <UiSegmented
          :model-value="template.trigger"
          :options="triggers"
          data-testid="template-trigger"
          @update:model-value="panels.updateTemplate(node.id, { trigger: $event })"
        />
      </UiRow>
      <UiRow label="套用设备" hint="按设备类型填好字段，会替换现有字段">
        <select class="s-select" data-testid="template-device-type" @change="applyDeviceType">
          <option value="">选择设备类型…</option>
          <option v-for="type in deviceTemplates" :key="type.id" :value="type.id">{{ type.name }}</option>
        </select>
      </UiRow>
    </UiSection>

    <UiSection title="字段" :count="template.fields.length">
      <template #actions>
        <button class="s-icon-btn" title="添加字段" data-testid="add-field" @click="panels.addField(node.id)">
          <Plus :size="12" />
        </button>
      </template>
      <div class="fields">
        <div class="field field--head"><span>显示名</span><span>变量名</span><span>单位</span><span /></div>
        <div v-for="field in template.fields" :key="field.id" class="field" :data-testid="`field-${field.variableKey}`">
          <UiText :model-value="field.label" @commit="panels.updateField(node.id, field.id, { label: $event })" />
          <UiText
            :model-value="field.variableKey"
            mono
            @commit="panels.updateField(node.id, field.id, { variableKey: $event.trim() })"
          />
          <UiText
            :model-value="field.unit ?? ''"
            @commit="panels.updateField(node.id, field.id, { unit: $event.trim() })"
          />
          <button class="s-icon-btn" title="删除字段" @click="panels.removeField(node.id, field.id)">
            <X :size="12" />
          </button>
        </div>
        <p v-if="!template.fields.length" class="s-hint">还没有字段。用上面的「套用设备」，或点 + 一条条加。</p>
      </div>
    </UiSection>

    <UiSection title="子元素" :count="children.length">
      <div class="batch">
        <div class="batch__title">批量添加：同一种模型各放一个面板</div>
        <div class="batch__groups">
          <button
            v-for="group in modelGroups"
            :key="group.assetId"
            class="s-btn s-btn--sm"
            :title="`给 ${group.nodeIds.length} 个同样的模型各放一个面板，放在模型顶部`"
            :data-testid="`add-on-models-${group.label}`"
            @click="panels.addOnModels(node.id, group.nodeIds)"
          >
            <Plus :size="12" />全部「{{ group.label }}」× {{ group.nodeIds.length }}
          </button>
        </div>
        <p v-if="!modelGroups.length" class="s-hint">场景里还没有模型。</p>
      </div>

      <template v-if="children.length">
        <div class="number">
          <span>批量编号</span>
          <input v-model="prefix" class="s-input" placeholder="前缀" data-testid="number-prefix" />
          <UiNumber :model-value="start" :step="1" :precision="0" :min="0" @update="start = Math.round($event)" />
          <button
            class="s-btn s-btn--sm"
            data-testid="number-devices"
            @click="panels.numberDevices(node.id, prefix, start)"
          >
            应用
          </button>
        </div>
        <div v-for="panel in children" :key="panel.id" class="child" :data-testid="`child-${panel.name}`">
          <button class="child__name" :title="panel.name" @click="session.select([panel.id])">{{ panel.name }}</button>
          <UiText
            :model-value="deviceOf(panel.id)"
            mono
            placeholder="设备编号"
            @commit="panels.setDevice(panel.id, $event)"
          />
          <button class="s-icon-btn" title="移除面板" @click="panels.removePanels([panel.id])"><X :size="12" /></button>
        </div>
      </template>
    </UiSection>
  </div>
</template>

<style scoped>
.add {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--s-line);
}
.add .s-hint {
  margin: 0;
  line-height: 1.5;
}
.fields {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 2px 12px 10px;
}
.fields .s-hint {
  margin: 0;
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
.batch {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 2px 12px 10px;
}
.batch__title {
  color: var(--s-fg-3);
  font-size: 11px;
}
.batch__groups {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.batch .s-hint {
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
.child {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 96px 22px;
  align-items: center;
  gap: 4px;
  padding: 3px 12px;
  border-top: 1px solid var(--s-line);
}
.child__name {
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
.child__name:hover {
  color: var(--s-accent-2);
}
</style>
