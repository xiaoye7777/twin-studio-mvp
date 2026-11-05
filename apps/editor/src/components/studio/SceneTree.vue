<script setup lang="ts">
/**
 * 场景树：搜索、层级、多选、改名、拖动调整层级、右键菜单。
 * 标签组和面板也在这里：「添加标签」新建一个标签组，选中它后在右栏添加面板。
 */
import {
  Box,
  ChevronRight,
  Eye,
  EyeOff,
  Folder,
  FolderOpen,
  Lock,
  Plus,
  Radio,
  Search,
  Shapes,
  Tag,
  Tags,
  Unlock,
} from 'lucide-vue-next'
import { computed, nextTick, reactive, ref } from 'vue'
import { canParent, dataOwnerOf, targetNodeId, type SceneNodeV2 } from '@twin-studio/core'
import { type MenuSections, useContextMenu } from '@/components/ui/menu'
import UiMenu from '@/components/ui/UiMenu.vue'
import { useSession } from '@/studio/context'
import { useShell } from '@/studio/shell'

const session = useSession()
const shell = useShell()
const query = ref('')
const collapsed = reactive(new Set<string>())
const drag = reactive({ ids: [] as string[], over: '' as string, zone: '' as '' | 'before' | 'into' | 'after' })
const menu = useContextMenu()
const renameText = ref('')
const renameInput = ref<HTMLInputElement[]>()

const icons: Record<string, unknown> = { model: Box, group: Folder, 'panel-group': Tags, panel: Tag }

interface NodeRow {
  key: string
  node: SceneNodeV2
  depth: number
  hasChildren: boolean
  open: boolean
  hiddenByParent: boolean
}

const bound = computed(() => {
  const doc = session.doc.value
  const ids = new Set(doc.bindings.map(binding => targetNodeId(binding.target)))
  return new Set(doc.nodes.filter(node => ids.has(dataOwnerOf(doc, node).id)).map(node => node.id))
})

const rows = computed<NodeRow[]>(() => {
  const doc = session.doc.value
  const byParent = new Map<string | null, SceneNodeV2[]>()
  for (const node of doc.nodes) {
    const list = byParent.get(node.parentId) ?? []
    list.push(node)
    byParent.set(node.parentId, list)
  }
  const term = query.value.trim().toLowerCase()
  const matches = (node: SceneNodeV2): boolean =>
    node.name.toLowerCase().includes(term) || (byParent.get(node.id) ?? []).some(matches)
  const result: NodeRow[] = []
  const walk = (parentId: string | null, depth: number, hiddenByParent: boolean) => {
    for (const node of byParent.get(parentId) ?? []) {
      if (term && !matches(node)) continue
      const children = byParent.get(node.id) ?? []
      const open = !collapsed.has(node.id)
      result.push({ key: node.id, node, depth, hasChildren: children.length > 0, open, hiddenByParent })
      if (children.length && (term || open)) walk(node.id, depth + 1, hiddenByParent || !node.visible)
    }
  }
  walk(null, 0, false)
  return result
})

const selected = computed(() => new Set(session.selection.value))

function click(event: MouseEvent, row: NodeRow): void {
  if (event.shiftKey && session.selection.value.length) {
    const ids = rows.value.map(item => item.node.id)
    const from = ids.indexOf(session.selection.value.at(-1)!)
    const to = ids.indexOf(row.node.id)
    if (from >= 0 && to >= 0) {
      session.select(ids.slice(Math.min(from, to), Math.max(from, to) + 1), 'add')
      return
    }
  }
  session.select([row.node.id], event.metaKey || event.ctrlKey ? 'toggle' : 'replace')
}

function toggleCollapse(id: string): void {
  if (collapsed.has(id)) collapsed.delete(id)
  else collapsed.add(id)
}

async function startRename(node: SceneNodeV2): Promise<void> {
  shell.renaming = node.id
  renameText.value = node.name
  await nextTick()
  renameInput.value?.[0]?.select()
}

function finishRename(node: SceneNodeV2): void {
  if (shell.renaming !== node.id) return
  shell.renaming = null
  session.nodes.rename(node.id, renameText.value)
}

function addLabel(): void {
  const id = session.panels.addGroup()
  collapsed.delete(id)
}

// ---------------------------------------------------------------- 拖动调整层级

/** 拖动的节点能不能放到这个父节点下面（面板只能在标签组里）。 */
function accepts(parent: SceneNodeV2 | null): boolean {
  return drag.ids.every(id => {
    const node = session.node(id)
    return !!node && canParent(parent?.kind ?? null, node.kind)
  })
}

function onDragStart(event: DragEvent, row: NodeRow): void {
  drag.ids = selected.value.has(row.node.id) ? [...session.selection.value] : [row.node.id]
  event.dataTransfer?.setData('text/plain', drag.ids.join(','))
  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'
}

function onDragOver(event: DragEvent, row: NodeRow): void {
  if (!drag.ids.length || drag.ids.includes(row.node.id)) return
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
  const y = (event.clientY - rect.top) / rect.height
  const parent = row.node.parentId ? (session.node(row.node.parentId) ?? null) : null
  const into = accepts(row.node) && y > 0.28 && y < 0.72
  if (!into && !accepts(parent)) {
    drag.over = ''
    return
  }
  event.preventDefault()
  drag.over = row.node.id
  drag.zone = into ? 'into' : y < 0.5 ? 'before' : 'after'
}

function onDrop(event: DragEvent, row: NodeRow): void {
  event.preventDefault()
  const ids = drag.ids
  const zone = drag.zone
  const accepted = drag.over === row.node.id
  resetDrag()
  if (!ids.length || !accepted || ids.includes(row.node.id)) return
  if (zone === 'into') session.nodes.reparent(ids, row.node.id)
  else if (zone === 'before') session.nodes.reparent(ids, row.node.parentId, row.node.id)
  else {
    const siblings = session.doc.value.nodes.filter(
      node => node.parentId === row.node.parentId && !ids.includes(node.id),
    )
    const next = siblings[siblings.findIndex(node => node.id === row.node.id) + 1]
    session.nodes.reparent(ids, row.node.parentId, next?.id)
  }
}

function onDropRoot(event: DragEvent): void {
  if (!drag.ids.length) return
  event.preventDefault()
  const ids = drag.ids
  const allowed = accepts(null)
  resetDrag()
  if (allowed) session.nodes.reparent(ids, null)
}

function resetDrag(): void {
  drag.ids = []
  drag.over = ''
  drag.zone = ''
}

// ---------------------------------------------------------------- 右键菜单

function openMenu(event: MouseEvent, row: NodeRow | null): void {
  if (row && !selected.value.has(row.node.id)) session.select([row.node.id])
  menu.openAt(event)
}

/** 右键菜单：点在对象上是对象菜单；没选中东西时只有新建。 */
const menuSections = computed<MenuSections>(() => {
  const nodes = session.selectedNodes
  const create = [
    { label: '新建分组', action: () => void session.nodes.addGroup() },
    { label: '添加标签（浮窗）', action: addLabel },
  ]
  if (!nodes.length) return [create]
  const one = nodes.length === 1 ? nodes[0]! : null
  const ids = nodes.map(node => node.id)
  const allLocked = nodes.every(node => node.locked)
  const onlyPanels = nodes.every(node => node.kind === 'panel')
  return [
    [
      ...(one ? [{ label: '重命名', action: () => void startRename(one) }] : []),
      { label: '聚焦', action: () => void session.focusSelection() },
      { label: '创建副本', action: () => session.nodes.duplicateSelection() },
      ...(one?.kind === 'panel-group'
        ? [{ label: '添加子元素', action: () => session.panels.startPlacing(one.id) }]
        : []),
    ],
    onlyPanels
      ? []
      : [
          { label: '组合', action: () => session.nodes.groupSelection() },
          ...(nodes.some(node => node.kind === 'group')
            ? [{ label: '取消组合', action: () => session.nodes.ungroupSelection() }]
            : []),
          { label: '移到最外层', action: () => session.nodes.reparent(ids, null) },
          ...create,
        ],
    [
      {
        label: nodes.every(node => node.visible) ? '隐藏' : '显示',
        action: () => session.nodes.toggleVisibilityOfSelection(),
      },
      { label: allLocked ? '解锁' : '锁定', action: () => session.nodes.setLocked(ids, !allLocked) },
    ],
    [{ label: '删除', action: () => session.nodes.deleteSelection(), danger: true }],
  ]
})
</script>

<template>
  <div class="tree">
    <div class="tree__bar">
      <div class="tree__search">
        <Search :size="13" />
        <input v-model="query" placeholder="搜索对象" data-testid="tree-search" />
      </div>
      <button
        class="s-btn tree__add"
        title="添加标签（浮窗）：在场景树里新建一个标签组"
        data-testid="add-label"
        @click="addLabel"
      >
        <Plus :size="12" />标签
      </button>
    </div>
    <div
      class="tree__list s-scroll"
      data-testid="scene-tree"
      @contextmenu="openMenu($event, null)"
      @dragover.prevent
      @drop="onDropRoot"
      @click.self="session.clearSelection()"
    >
      <div
        v-for="row in rows"
        :key="row.key"
        class="tree__row"
        :class="{
          'is-selected': selected.has(row.node.id),
          'is-hovered': session.hovered.value === row.node.id,
          'is-hidden': !row.node.visible || row.hiddenByParent,
          'is-drop-into': drag.over === row.node.id && drag.zone === 'into',
          'is-drop-before': drag.over === row.node.id && drag.zone === 'before',
          'is-drop-after': drag.over === row.node.id && drag.zone === 'after',
        }"
        :style="{ paddingLeft: `${8 + row.depth * 14}px` }"
        :data-testid="`tree-row-${row.node.name}`"
        :data-node-id="row.node.id"
        draggable="true"
        @click="click($event, row)"
        @dblclick="startRename(row.node)"
        @contextmenu.stop="openMenu($event, row)"
        @mouseenter="session.pointer.setHovered(row.node.id)"
        @mouseleave="session.pointer.setHovered(null)"
        @dragstart="onDragStart($event, row)"
        @dragover="onDragOver($event, row)"
        @dragleave="drag.over === row.node.id && (drag.over = '')"
        @drop.stop="onDrop($event, row)"
        @dragend="resetDrag"
      >
        <button
          class="tree__chevron"
          :class="{ 'is-open': row.open, 'is-empty': !row.hasChildren }"
          tabindex="-1"
          @click.stop="toggleCollapse(row.node.id)"
        >
          <ChevronRight :size="12" />
        </button>
        <component
          :is="row.node.kind === 'group' && row.open && row.hasChildren ? FolderOpen : icons[row.node.kind]"
          class="tree__icon"
          :class="`is-${row.node.kind}`"
          :size="14"
        />
        <input
          v-if="shell.renaming === row.node.id"
          ref="renameInput"
          v-model="renameText"
          class="tree__rename"
          @click.stop
          @blur="finishRename(row.node)"
          @keydown.enter.prevent="finishRename(row.node)"
          @keydown.esc.prevent="shell.renaming = null"
        />
        <span v-else class="tree__name">{{ row.node.name }}</span>
        <span class="tree__badges">
          <Radio v-if="bound.has(row.node.id)" class="tree__badge is-data" :size="12" title="已绑定设备" />
        </span>
        <button
          class="tree__toggle"
          :class="{ 'is-on': row.node.locked }"
          :title="row.node.locked ? '解锁' : '锁定'"
          @click.stop="session.nodes.setLocked([row.node.id], !row.node.locked)"
        >
          <Lock v-if="row.node.locked" :size="12" /><Unlock v-else :size="12" />
        </button>
        <button
          class="tree__toggle"
          :class="{ 'is-on': !row.node.visible }"
          :title="row.node.visible ? '隐藏' : '显示'"
          @click.stop="session.nodes.setVisible([row.node.id], !row.node.visible)"
        >
          <EyeOff v-if="!row.node.visible" :size="12" /><Eye v-else :size="12" />
        </button>
      </div>
      <div v-if="!rows.length" class="s-empty">
        <Shapes :size="22" />
        <span>{{ query ? '没有匹配的对象' : '场景还是空的' }}</span>
        <span v-if="!query" class="s-hint">从底部资源栏把模型拖进场景</span>
      </div>
    </div>
    <div class="tree__footer s-hint">
      {{ session.doc.value.nodes.length }} 个对象 · 已选 {{ session.selection.value.length }}
    </div>

    <UiMenu v-if="menu.visible" :x="menu.x" :y="menu.y" :sections="menuSections" @close="menu.close()" />
  </div>
</template>

<style scoped>
.tree {
  display: flex;
  min-height: 0;
  flex: 1;
  flex-direction: column;
}
.tree__bar {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  gap: 6px;
  margin: 8px 8px 4px;
}
.tree__add {
  height: 28px;
  flex-shrink: 0;
  padding: 0 8px;
}
.tree__search {
  display: flex;
  min-width: 0;
  height: 28px;
  flex: 1;
  align-items: center;
  gap: 6px;
  padding: 0 8px;
  border: 1px solid var(--s-line-2);
  border-radius: 5px;
  background: var(--s-field);
  color: var(--s-fg-3);
}
.tree__search:focus-within {
  border-color: var(--s-accent-line);
}
.tree__search input {
  width: 100%;
  border: 0;
  background: transparent;
  outline: none;
  font-size: 12px;
}
.tree__list {
  padding: 2px 0 12px;
}
.tree__row {
  position: relative;
  display: flex;
  height: 26px;
  align-items: center;
  gap: 4px;
  padding-right: 6px;
  color: var(--s-fg);
  cursor: default;
}
.tree__row:hover,
.tree__row.is-hovered {
  background: var(--s-hover);
}
.tree__row.is-selected {
  background: var(--s-accent-soft);
}
.tree__row.is-selected::before {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  width: 2px;
  background: var(--s-accent);
  content: '';
}
.tree__row.is-hidden .tree__name,
.tree__row.is-hidden .tree__icon {
  opacity: 0.45;
}
.tree__row.is-drop-into {
  box-shadow: inset 0 0 0 1px var(--s-accent);
}
.tree__row.is-drop-before {
  box-shadow: inset 0 2px 0 var(--s-accent);
}
.tree__row.is-drop-after {
  box-shadow: inset 0 -2px 0 var(--s-accent);
}
.tree__chevron {
  display: grid;
  width: 14px;
  height: 14px;
  flex-shrink: 0;
  place-items: center;
  padding: 0;
  border: 0;
  background: none;
  color: var(--s-fg-3);
  cursor: pointer;
  transition: transform 120ms ease;
}
.tree__chevron.is-open {
  transform: rotate(90deg);
}
.tree__chevron.is-empty {
  visibility: hidden;
}
.tree__icon {
  flex-shrink: 0;
  color: var(--s-fg-3);
}
.tree__icon.is-model {
  color: var(--s-kind-model);
}
.tree__icon.is-group {
  color: var(--s-kind-group);
}
.tree__icon.is-panel-group,
.tree__icon.is-panel {
  color: var(--s-kind-label);
}
.tree__name {
  overflow: hidden;
  min-width: 0;
  flex: 1;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.tree__rename {
  min-width: 0;
  flex: 1;
  height: 20px;
  padding: 0 4px;
  border: 1px solid var(--s-accent-line);
  border-radius: 3px;
  background: var(--s-field);
  outline: none;
  font-size: 12px;
}
.tree__badges {
  display: flex;
  gap: 3px;
}
.tree__badge.is-data {
  color: var(--s-data);
}
.tree__toggle {
  display: grid;
  width: 18px;
  height: 18px;
  flex-shrink: 0;
  place-items: center;
  padding: 0;
  border: 0;
  border-radius: 3px;
  background: none;
  color: var(--s-fg-3);
  opacity: 0;
  cursor: pointer;
}
.tree__row:hover .tree__toggle,
.tree__toggle.is-on {
  opacity: 1;
}
.tree__toggle:hover {
  background: var(--s-hover);
  color: var(--s-fg);
}
.tree__toggle.is-on {
  color: var(--s-accent-2);
}
.tree__footer {
  flex-shrink: 0;
  padding: 6px 12px;
  border-top: 1px solid var(--s-line);
}
</style>
