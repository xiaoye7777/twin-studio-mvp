<script setup lang="ts">
/** 右栏：选中对象时是属性和数据；选中标签组时是模板配置；什么都没选时是场景的数据接口。 */
import { computed } from 'vue'
import { nodeKindLabels, useSession } from '@/studio/context'
import { useShell } from '@/studio/shell'
import NodeData from './inspector/NodeData.vue'
import NodeProperties from './inspector/NodeProperties.vue'
import PanelGroupInspector from './inspector/PanelGroupInspector.vue'
import SceneData from './inspector/SceneData.vue'

const session = useSession()
const shell = useShell()
const nodes = computed(() => session.selection.value.flatMap(id => session.node(id) ?? []))
const panelGroup = computed(() => {
  const node = nodes.value.length === 1 ? nodes.value[0]! : null
  return node?.kind === 'panel-group' ? node : null
})
const title = computed(() => {
  if (!nodes.value.length) return '场景'
  if (nodes.value.length > 1) return `已选 ${nodes.value.length} 个对象`
  return nodeKindLabels[nodes.value[0]!.kind] ?? '对象'
})
const nodeTabs = [
  { id: 'properties', label: '属性' },
  { id: 'data', label: '数据' },
] as const
</script>

<template>
  <aside class="s-panel inspector" data-testid="inspector">
    <div class="s-panel-head">
      <span v-if="panelGroup" class="s-tab is-active">模板</span>
      <template v-else-if="nodes.length">
        <button
          v-for="tab in nodeTabs"
          :key="tab.id"
          class="s-tab"
          :class="{ 'is-active': shell.nodeTab === tab.id }"
          :data-testid="`inspector-tab-${tab.id}`"
          @click="shell.nodeTab = tab.id"
        >
          {{ tab.label }}
        </button>
      </template>
      <span v-else class="s-tab is-active">数据</span>
      <span class="inspector__title">{{ title }}</span>
    </div>
    <div class="s-scroll">
      <PanelGroupInspector v-if="panelGroup" :key="panelGroup.id" :node="panelGroup" />
      <template v-else-if="nodes.length">
        <NodeProperties v-if="shell.nodeTab === 'properties'" :nodes="nodes" />
        <NodeData v-else :nodes="nodes" />
      </template>
      <SceneData v-else />
    </div>
  </aside>
</template>

<style scoped>
.inspector__title {
  overflow: hidden;
  margin-left: auto;
  padding-right: 6px;
  color: var(--s-fg-3);
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
