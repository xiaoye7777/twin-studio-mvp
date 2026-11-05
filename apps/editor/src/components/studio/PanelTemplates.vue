<script setup lang="ts">
/** 左栏「面板」：面板模板列表。点一个模板，右栏编辑它的字段和实例。 */
import { Plus, SquareStack } from 'lucide-vue-next'
import { computed } from 'vue'
import { useSession } from '@/studio/context'
import { useShell } from '@/studio/shell'

const session = useSession()
const shell = useShell()
const doc = computed(() => session.doc.value)

function open(id: string): void {
  session.clearSelection()
  shell.templateId = id
}

function add(preset: 'blank' | 'cabinet'): void {
  open(session.panels.addTemplate(preset))
}
</script>

<template>
  <div class="s-scroll templates" data-testid="panel-templates">
    <div class="templates__add">
      <button class="s-btn" data-testid="add-template" @click="add('blank')"><Plus :size="13" />空白模板</button>
      <button class="s-btn" data-testid="add-cabinet-template" @click="add('cabinet')">
        <Plus :size="13" />储能柜模板
      </button>
    </div>
    <p v-if="!doc.panelTemplates.length" class="s-hint">
      模板决定点击对象时面板显示什么。把模板挂到对象上就是实例，改模板时所有实例一起变。
    </p>
    <button
      v-for="template in doc.panelTemplates"
      :key="template.id"
      class="template"
      :class="{ 'is-active': shell.templateId === template.id && !session.selection.value.length }"
      :data-testid="`template-${template.name}`"
      @click="open(template.id)"
    >
      <SquareStack :size="14" />
      <span class="template__name">{{ template.name }}</span>
      <span class="s-badge">{{ session.panels.instancesOf(template.id).length }} 个实例</span>
    </button>
  </div>
</template>

<style scoped>
.templates {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 6px;
  padding: 10px;
}
.templates .s-hint {
  margin: 0;
}
.templates__add {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
}
.template {
  display: flex;
  width: 100%;
  align-items: center;
  gap: 8px;
  padding: 8px;
  border: 1px solid var(--s-line);
  border-radius: 6px;
  background: var(--s-panel-2);
  color: var(--s-fg);
  cursor: pointer;
  text-align: left;
}
.template:hover,
.template.is-active {
  border-color: var(--s-accent);
}
.template__name {
  overflow: hidden;
  min-width: 0;
  flex: 1;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
