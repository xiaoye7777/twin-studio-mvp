<script setup lang="ts">
/** 选中一个面板时：它和模板不同的地方（覆盖）、关联的对象、设备。 */
import { RotateCcw, Tags } from 'lucide-vue-next'
import { computed } from 'vue'
import type { PanelNodeV2 } from '@twin-studio/core'
import UiRow from '@/components/ui/UiRow.vue'
import UiSection from '@/components/ui/UiSection.vue'
import UiText from '@/components/ui/UiText.vue'
import { useSession } from '@/studio/context'

const props = defineProps<{ node: PanelNodeV2 }>()
const session = useSession()
const group = computed(() => {
  const parent = session.node(props.node.parentId ?? '')
  return parent?.kind === 'panel-group' ? parent : null
})
const models = computed(() => session.doc.value.nodes.filter(item => item.kind === 'model'))
const deviceId = computed(() => session.devices.bindingFor(props.node.id)?.device.id ?? '')
const hasOverride = computed(() => props.node.panel.title !== undefined || !!props.node.panel.hiddenFields?.length)
</script>

<template>
  <UiSection title="面板" data-testid="panel-instance">
    <UiRow label="关联对象" hint="面板显示这个对象绑定的设备的数据；点击它时显示面板（点击显示模式）">
      <select
        class="s-select"
        :value="node.panel.targetNodeId ?? ''"
        data-testid="panel-target"
        @change="session.panels.setTarget(node.id, ($event.target as HTMLSelectElement).value || null)"
      >
        <option value="">不关联</option>
        <option v-for="model in models" :key="model.id" :value="model.id">{{ model.name }}</option>
      </select>
    </UiRow>
    <UiRow label="设备编号">
      <UiText
        :model-value="deviceId"
        mono
        placeholder="例如 ESS-001"
        data-testid="panel-device"
        @commit="session.panels.setDevice(node.id, $event)"
      />
    </UiRow>
    <UiRow label="标题">
      <UiText
        :model-value="node.panel.title ?? ''"
        placeholder="跟随模板"
        data-testid="panel-title"
        @commit="session.panels.setTitle(node.id, $event)"
      />
    </UiRow>
    <div v-if="group?.template.fields.length" class="fields">
      <label v-for="field in group.template.fields" :key="field.id" class="fields__item">
        <input
          type="checkbox"
          :checked="!node.panel.hiddenFields?.includes(field.id)"
          @change="session.panels.toggleField(node.id, field.id)"
        />
        <span>显示「{{ field.label }}」</span>
      </label>
    </div>
    <div class="actions">
      <button class="s-btn s-btn--sm" :disabled="!hasOverride" @click="session.panels.resetOverrides(node.id)">
        <RotateCcw :size="12" />恢复成模板
      </button>
      <button v-if="group" class="s-btn s-btn--sm" @click="session.select([group!.id])">
        <Tags :size="12" />编辑模板
      </button>
    </div>
  </UiSection>
</template>

<style scoped>
.fields {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 2px 8px;
  padding: 4px 12px;
}
.fields__item {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 5px;
  color: var(--s-fg-2);
  font-size: 11.5px;
  cursor: pointer;
}
.actions {
  display: flex;
  gap: 6px;
  padding: 6px 12px 10px;
}
</style>
