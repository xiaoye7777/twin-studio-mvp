import { type Component, reactive } from 'vue'

/** One row of a menu (right-click menus, dropdowns). */
export interface MenuItem {
  label: string
  action: () => void
  /** A lucide icon in front of the label. */
  icon?: Component
  /** Shown on the right, e.g. ⌘C. */
  shortcut?: string
  /** Red text: deleting and the like. */
  danger?: boolean
  disabled?: boolean
  /** A tick in front (on/off options). */
  checked?: boolean
  testid?: string
}

/** A menu is groups of items with a line between groups. Empty groups are skipped. */
export type MenuSections = MenuItem[][]

/**
 * State of a right-click menu: where it is open (viewport pixels) or closed.
 *
 *   const menu = useContextMenu()
 *   <div @contextmenu="menu.openAt($event)">
 *   <UiMenu v-if="menu.visible" :x="menu.x" :y="menu.y" :sections="items" @close="menu.close()" />
 */
export function useContextMenu() {
  const state = reactive({
    visible: false,
    x: 0,
    y: 0,
    openAt(event: MouseEvent): void {
      event.preventDefault()
      state.x = event.clientX
      state.y = event.clientY
      state.visible = true
    },
    close(): void {
      state.visible = false
    },
  })
  return state
}
