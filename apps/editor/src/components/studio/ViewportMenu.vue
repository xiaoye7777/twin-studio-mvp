<script setup lang="ts">
/** 三维视口的右键菜单：内容随点到的东西变化（选中的对象 / 空白处）。 */
import { Vector3 } from 'three'
import { computed } from 'vue'
import type { MenuItem, MenuSections } from '@/components/ui/menu'
import UiMenu from '@/components/ui/UiMenu.vue'
import { useSession } from '@/studio/context'
import { useShell } from '@/studio/shell'

const session = useSession()
const shell = useShell()
const menu = computed(() => session.ui.contextMenu)
const mod = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl+'
const point = computed(() => (menu.value?.point ? new Vector3(...menu.value.point) : null))

const sections = computed<MenuSections>(() => {
  const nodes = session.selectedNodes
  const paste: MenuItem[] = session.ui.hasClipboard
    ? [{ label: '粘贴到这里', shortcut: `${mod}V`, action: () => session.nodes.paste(point.value) }]
    : []
  if (nodes.length) {
    const one = nodes.length === 1 ? nodes[0]! : null
    const onlyPanels = nodes.every(node => node.kind === 'panel')
    return [
      [
        { label: '聚焦', shortcut: 'F', action: () => void session.focusSelection() },
        { label: '复制', shortcut: `${mod}C`, action: () => session.nodes.copySelection() },
        ...paste,
        { label: '创建副本', shortcut: `${mod}D`, action: () => session.nodes.duplicateSelection() },
      ],
      [
        ...(onlyPanels ? [] : [{ label: '组合', shortcut: `${mod}G`, action: () => session.nodes.groupSelection() }]),
        ...(nodes.some(node => node.kind === 'group')
          ? [{ label: '取消组合', shortcut: `${mod}⇧G`, action: () => session.nodes.ungroupSelection() }]
          : []),
        {
          label: nodes.every(node => node.visible) ? '隐藏' : '显示',
          shortcut: 'H',
          action: () => session.nodes.toggleVisibilityOfSelection(),
        },
        {
          label: nodes.every(node => node.locked) ? '解锁' : '锁定',
          action: () =>
            session.nodes.setLocked(
              nodes.map(node => node.id),
              !nodes.every(node => node.locked),
            ),
        },
        ...(onlyPanels ? [] : [{ label: '放到地面', shortcut: 'End', action: () => session.nodes.dropToGround() }]),
      ],
      one?.kind === 'panel-group'
        ? []
        : [
            {
              label: nodes.length > 1 ? '批量绑定设备…' : '绑定设备…',
              action: () => (nodes.length > 1 ? (shell.dialog = 'batch-bind') : (shell.nodeTab = 'data')),
            },
          ],
      [{ label: '删除', shortcut: 'Del', action: () => session.nodes.deleteSelection(), danger: true }],
    ]
  }
  return [
    [...paste, { label: '添加标签（浮窗）', action: () => void session.panels.addGroup() }],
    [
      { label: '保存当前视角', action: () => void session.cameras.add() },
      { label: '设为初始视角', action: () => session.cameras.setOpeningView() },
    ],
    [{ label: '全选', shortcut: `${mod}A`, action: () => session.selectAll() }],
  ]
})
</script>

<template>
  <UiMenu
    v-if="menu"
    :x="menu.x"
    :y="menu.y"
    :sections="sections"
    testid="viewport-menu"
    @close="session.pointer.closeContextMenu()"
  />
</template>
