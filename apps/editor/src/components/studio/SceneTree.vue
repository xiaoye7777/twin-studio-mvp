<script setup lang="ts">
/** 场景树：显示层级，点击选中（Ctrl / Shift 多选），双击改名，拖动调整层级。 */
import { Box, ChevronRight, Copy, Eye, EyeOff, Folder, FolderPlus, Group, Lock, Trash2, Ungroup } from 'lucide-vue-next'
import { computed, nextTick, ref } from 'vue'
import type { SceneNodeV2 } from '@twin-studio/core'
import { useSession } from '@/studio/context'

const session = useSession()
const collapsed = ref(new Set<string>())
const renaming = ref<string | null>(null)
const dragging = ref<string[]>([])
const dropOn = ref<string | null>(null)
const selection = computed(() => session.selection.value)
const hasGroupSelected = computed(() => session.selectedNodes.some(node => node.kind === 'group'))

/** 把层级摊平成一行一行的列表。 */
const rows = computed(() => {
  const nodes = session.doc.value.nodes
  const result: Array<{ node: SceneNodeV2; depth: number; hasChildren: boolean }> = []
  const visit = (parentId: string | null, depth: number) => {
    for (const node of nodes) {
      if (node.parentId !== parentId) continue
      const hasChildren = nodes.some(item => item.parentId === node.id)
      result.push({ node, depth, hasChildren })
      if (hasChildren && !collapsed.value.has(node.id)) visit(node.id, depth + 1)
    }
  }
  visit(null, 0)
  return result
})

function toggleCollapsed(id: string): void {
  const next = new Set(collapsed.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  collapsed.value = next
}

function click(event: MouseEvent, id: string): void {
  session.select([id], event.ctrlKey || event.metaKey || event.shiftKey ? 'toggle' : 'replace')
}

async function startRename(id: string): Promise<void> {
  renaming.value = id
  await nextTick()
  const input = document.querySelector<HTMLInputElement>('.tree__rename')
  input?.focus()
  input?.select()
}

function finishRename(id: string, event: Event): void {
  session.nodes.rename(id, (event.target as HTMLInputElement).value)
  renaming.value = null
}

function dragStart(event: DragEvent, id: string): void {
  dragging.value = selection.value.includes(id) ? [...selection.value] : [id]
  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'
}

/** 放到分组上就进分组，放到其他行上就排到它前面。 */
function drop(target: SceneNodeV2): void {
  const ids = dragging.value.filter(id => id !== target.id)
  dragging.value = []
  dropOn.value = null
  if (!ids.length) return
  if (target.kind === 'group') session.nodes.move(ids, target.id)
  else session.nodes.move(ids, target.parentId, target.id)
}

function dropToRoot(): void {
  const ids = dragging.value
  dragging.value = []
  dropOn.value = null
  if (ids.length) session.nodes.move(ids, null)
}
</script>

<template>
  <div class="tree" data-testid="scene-tree">
    <div class="tree__actions">
      <button class="s-icon-btn" title="新建分组" data-testid="add-group" @click="session.nodes.addGroup()">
        <FolderPlus :size="14" />
      </button>
      <button class="s-icon-btn" title="编组" :disabled="!selection.length" @click="session.nodes.groupSelection()">
        <Group :size="14" />
      </button>
      <button
        class="s-icon-btn"
        title="取消编组"
        :disabled="!hasGroupSelected"
        @click="session.nodes.ungroupSelection()"
      >
        <Ungroup :size="14" />
      </button>
      <span class="tree__space" />
      <button
        class="s-icon-btn"
        title="复制（Ctrl+D）"
        :disabled="!selection.length"
        @click="session.nodes.duplicateSelection()"
      >
        <Copy :size="14" />
      </button>
      <button
        class="s-icon-btn"
        title="删除（Delete）"
        data-testid="delete-selection"
        :disabled="!selection.length"
        @click="session.nodes.removeSelection()"
      >
        <Trash2 :size="14" />
      </button>
    </div>
    <div class="s-scroll tree__rows" @dragover.prevent @drop.prevent="dropToRoot">
      <p v-if="!rows.length" class="tree__empty s-hint">从底部资源栏把模型拖进场景。</p>
      <div
        v-for="{ node, depth, hasChildren } in rows"
        :key="node.id"
        class="row"
        :class="{
          'is-selected': selection.includes(node.id),
          'is-drop': dropOn === node.id,
          'is-hidden': !node.visible,
        }"
        :style="{ paddingLeft: `${6 + depth * 14}px` }"
        :data-testid="`tree-${node.name}`"
        draggable="true"
        @click="click($event, node.id)"
        @dblclick="startRename(node.id)"
        @dragstart="dragStart($event, node.id)"
        @dragover.prevent.stop="dropOn = node.id"
        @dragleave="dropOn === node.id && (dropOn = null)"
        @drop.prevent.stop="drop(node)"
      >
        <button
          class="row__chevron"
          :class="{ 'is-open': !collapsed.has(node.id), 'is-none': !hasChildren }"
          @click.stop="toggleCollapsed(node.id)"
        >
          <ChevronRight :size="12" />
        </button>
        <component :is="node.kind === 'group' ? Folder : Box" class="row__icon" :size="13" />
        <input
          v-if="renaming === node.id"
          class="tree__rename s-input"
          :value="node.name"
          @click.stop
          @blur="finishRename(node.id, $event)"
          @keydown.enter="($event.target as HTMLInputElement).blur()"
          @keydown.esc="renaming = null"
        />
        <span v-else class="row__name" :title="node.name">{{ node.name }}</span>
        <button
          class="row__toggle"
          :class="{ 'is-on': node.locked }"
          :title="node.locked ? '解锁' : '锁定'"
          @click.stop="session.nodes.setLocked(node.id, !node.locked)"
        >
          <Lock :size="12" />
        </button>
        <button
          class="row__toggle"
          :class="{ 'is-on': !node.visible }"
          :title="node.visible ? '隐藏' : '显示'"
          @click.stop="session.nodes.setVisible(node.id, !node.visible)"
        >
          <component :is="node.visible ? Eye : EyeOff" :size="12" />
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.tree {
  display: flex;
  min-height: 0;
  flex: 1;
  flex-direction: column;
}
.tree__actions {
  display: flex;
  flex: none;
  align-items: center;
  gap: 2px;
  padding: 4px 6px;
  border-bottom: 1px solid var(--s-line);
}
.tree__space {
  flex: 1;
}
.tree__rows {
  flex: 1;
  padding: 4px 0;
}
.tree__empty {
  padding: 12px;
}
.row {
  display: flex;
  height: 26px;
  align-items: center;
  gap: 4px;
  padding-right: 6px;
  cursor: default;
}
.row:hover {
  background: var(--s-hover);
}
.row.is-selected {
  background: var(--s-accent-soft);
}
.row.is-drop {
  box-shadow: inset 0 0 0 1px var(--s-accent);
}
.row.is-hidden .row__name {
  color: var(--s-fg-3);
}
.row__chevron {
  display: grid;
  width: 16px;
  height: 16px;
  flex: none;
  place-items: center;
  padding: 0;
  border: 0;
  background: none;
  color: var(--s-fg-3);
  cursor: pointer;
}
.row__chevron.is-open svg {
  transform: rotate(90deg);
}
.row__chevron.is-none {
  visibility: hidden;
}
.row__icon {
  flex: none;
  color: var(--s-fg-3);
}
.row__name {
  overflow: hidden;
  min-width: 0;
  flex: 1;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.tree__rename {
  min-width: 0;
  height: 20px;
  flex: 1;
}
.row__toggle {
  display: none;
  width: 18px;
  height: 18px;
  flex: none;
  place-items: center;
  padding: 0;
  border: 0;
  background: none;
  color: var(--s-fg-3);
  cursor: pointer;
}
.row:hover .row__toggle,
.row__toggle.is-on {
  display: grid;
}
.row__toggle:hover {
  color: var(--s-fg);
}
</style>
