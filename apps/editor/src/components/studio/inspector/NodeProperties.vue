<script setup lang="ts">
/** 选中对象时右栏的「属性」页签：基本属性和变换。多选时只改显隐和锁定。 */
import { computed } from 'vue'
import type { SceneNodeV2, SceneTransform } from '@twin-studio/core'
import UiNumber from '@/components/ui/UiNumber.vue'
import UiRow from '@/components/ui/UiRow.vue'
import UiSection from '@/components/ui/UiSection.vue'
import UiSwitch from '@/components/ui/UiSwitch.vue'
import UiText from '@/components/ui/UiText.vue'
import { useSession } from '@/studio/context'
import PanelInstanceFields from './PanelInstanceFields.vue'

const props = defineProps<{ nodes: SceneNodeV2[] }>()
const session = useSession()
const node = computed(() => (props.nodes.length === 1 ? props.nodes[0]! : null))
const ids = computed(() => props.nodes.map(item => item.id))
const allVisible = computed(() => props.nodes.every(item => item.visible))
const allLocked = computed(() => props.nodes.every(item => item.locked))
const axes = [
  { label: 'X', color: 'var(--s-x)' },
  { label: 'Y', color: 'var(--s-y)' },
  { label: 'Z', color: 'var(--s-z)' },
] as const
const DEGREES = 180 / Math.PI

const allRows: Array<{ key: keyof SceneTransform; label: string; factor: number; step: number; precision: number }> = [
  { key: 'position', label: '位置', factor: 1, step: 0.1, precision: 2 },
  { key: 'rotation', label: '旋转', factor: DEGREES, step: 1, precision: 1 },
  { key: 'scale', label: '缩放', factor: 1, step: 0.01, precision: 3 },
]
/** 面板始终面向镜头，旋转没有意义。 */
const rows = computed(() => allRows.filter(row => node.value?.kind !== 'panel' || row.key !== 'rotation'))
</script>

<template>
  <div data-testid="node-properties">
    <UiSection title="基本">
      <UiRow v-if="node" label="名称">
        <UiText :model-value="node.name" data-testid="node-name" @commit="session.nodes.rename(node!.id, $event)" />
      </UiRow>
      <UiRow label="显示">
        <UiSwitch :model-value="allVisible" @update:model-value="session.nodes.setVisible(ids, $event)" />
      </UiRow>
      <UiRow label="锁定">
        <UiSwitch :model-value="allLocked" @update:model-value="session.nodes.setLocked(ids, $event)" />
      </UiRow>
    </UiSection>

    <UiSection v-if="node" title="变换">
      <UiRow v-for="row in rows" :key="row.key" :label="row.label">
        <UiNumber
          v-for="(axis, index) in axes"
          :key="axis.label"
          :model-value="node.transform[row.key][index]! * row.factor"
          :label="axis.label"
          :label-color="axis.color"
          :step="row.step"
          :precision="row.precision"
          :data-testid="`${row.key}-${axis.label}`"
          @update="session.nodes.setTransformValue(node!.id, row.key, index, $event / row.factor)"
          @commit="session.commit()"
        />
      </UiRow>
    </UiSection>

    <PanelInstanceFields v-if="node?.kind === 'panel'" :key="node.id" :node="node" />
  </div>
</template>
