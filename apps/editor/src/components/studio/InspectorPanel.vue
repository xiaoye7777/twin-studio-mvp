<script setup lang="ts">
/** 右栏：选中节点时是节点属性；在面板页点了模板时是模板；什么都没选时是场景的接口数据。 */
import { computed } from 'vue'
import { useSession } from '@/studio/context'
import { useShell } from '@/studio/shell'
import DataSources from './inspector/DataSources.vue'
import NodeInspector from './inspector/NodeInspector.vue'
import PanelTemplateEditor from './inspector/PanelTemplateEditor.vue'

const session = useSession()
const shell = useShell()
const selected = computed(() => session.selectedNodes)
const templates = computed(() => session.doc.value.panelTemplates)

/** 多选时一次给所有选中的对象挂上面板模板。 */
function attachTemplate(event: Event): void {
  const select = event.target as HTMLSelectElement
  if (select.value) session.panels.addInstances(select.value, session.selection.value)
  select.value = ''
}

const template = computed(() =>
  shell.leftTab === 'panels' && shell.templateId
    ? session.doc.value.panelTemplates.find(item => item.id === shell.templateId)
    : undefined,
)
</script>

<template>
  <aside class="s-panel" data-testid="inspector">
    <NodeInspector v-if="selected.length === 1" :key="selected[0]!.id" :node="selected[0]!" />
    <div v-else-if="selected.length > 1" class="inspector__many">
      <p>已选中 {{ selected.length }} 个对象</p>
      <select v-if="templates.length" class="s-select" data-testid="batch-template" @change="attachTemplate">
        <option value="">批量挂上面板模板…</option>
        <option v-for="item in templates" :key="item.id" :value="item.id">{{ item.name }}</option>
      </select>
    </div>
    <PanelTemplateEditor v-else-if="template" :key="template.id" :template="template" />
    <DataSources v-else />
  </aside>
</template>

<style scoped>
.inspector__many {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
}
.inspector__many p {
  margin: 0;
  color: var(--s-fg-2);
}
</style>
