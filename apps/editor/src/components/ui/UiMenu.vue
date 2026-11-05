<script setup lang="ts">
import { Check } from 'lucide-vue-next'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import type { MenuItem, MenuSections } from './menu'

/**
 * A floating menu at a point of the window: right-click menus and dropdowns share it.
 * It stays on screen (flips near the right and bottom edges) and closes on a click elsewhere, Escape, the
 * wheel, or after an item runs.
 */
const props = withDefaults(
  defineProps<{
    sections: MenuSections
    x: number
    y: number
    width?: number
    testid?: string
    /** The button that opened the menu: clicks on it toggle, not close-then-reopen. */
    anchor?: HTMLElement | null
  }>(),
  { width: 200, testid: undefined, anchor: null },
)
const emit = defineEmits<{ close: [] }>()
const element = ref<HTMLElement>()
const groups = computed(() => props.sections.filter(section => section.length))
const showChecks = computed(() => groups.value.some(section => section.some(item => item.checked !== undefined)))

const position = computed(() => {
  const rows = groups.value.flat().length
  const height = rows * 28 + groups.value.length * 9 + 8
  return {
    width: `${props.width}px`,
    left: `${Math.max(8, Math.min(props.x, window.innerWidth - props.width - 8))}px`,
    top: `${props.y + height > window.innerHeight - 8 ? Math.max(8, props.y - height) : props.y}px`,
  }
})

/** 先执行再关闭：有的菜单项要读取菜单打开时记下的信息（如三维视口里点到的位置）。 */
function run(item: MenuItem): void {
  if (item.disabled) return
  item.action()
  emit('close')
}

function dismiss(event: Event): void {
  if (event instanceof KeyboardEvent && event.key !== 'Escape') return
  const target = event.target instanceof Node ? event.target : null
  if (target && (element.value?.contains(target) || props.anchor?.contains(target))) return
  emit('close')
}
const close = () => emit('close')
const events = ['pointerdown', 'keydown', 'wheel'] as const
onMounted(() => {
  // After the click that opened the menu, which must not close it again.
  setTimeout(() => events.forEach(type => window.addEventListener(type, dismiss, true)))
  window.addEventListener('blur', close)
})
onBeforeUnmount(() => {
  events.forEach(type => window.removeEventListener(type, dismiss, true))
  window.removeEventListener('blur', close)
})
</script>

<template>
  <Teleport to="body">
    <div ref="element" class="ui-menu" :style="position" :data-testid="testid" role="menu" @contextmenu.prevent>
      <template v-for="(section, index) in groups" :key="index">
        <div v-if="index > 0" class="ui-menu__sep" />
        <button
          v-for="item in section"
          :key="item.label"
          type="button"
          role="menuitem"
          class="ui-menu__item"
          :class="{ 'is-danger': item.danger }"
          :disabled="item.disabled"
          :data-testid="item.testid ?? `menu-${item.label}`"
          @click="run(item)"
        >
          <span v-if="showChecks" class="ui-menu__check"><Check v-if="item.checked" :size="13" /></span>
          <component :is="item.icon" v-if="item.icon" :size="13" class="ui-menu__icon" />
          <span class="ui-menu__label">{{ item.label }}</span>
          <span v-if="item.shortcut" class="ui-menu__key">{{ item.shortcut }}</span>
        </button>
      </template>
    </div>
  </Teleport>
</template>

<style scoped>
.ui-menu {
  position: fixed;
  z-index: 3000;
  display: flex;
  flex-direction: column;
  padding: 4px;
  border: 1px solid var(--s-float-line);
  border-radius: 8px;
  background: var(--s-float);
  box-shadow: var(--s-shadow);
  backdrop-filter: blur(10px);
  font-family: var(--s-font);
}
.ui-menu__item {
  display: flex;
  height: 28px;
  flex-shrink: 0;
  align-items: center;
  gap: 6px;
  padding: 0 10px;
  border: 0;
  border-radius: 5px;
  background: transparent;
  color: var(--s-fg);
  font-size: 12.5px;
  text-align: left;
  cursor: pointer;
}
.ui-menu__item:hover:not(:disabled) {
  background: var(--s-hover);
}
.ui-menu__item:disabled {
  color: var(--s-fg-3);
  cursor: default;
}
.ui-menu__item.is-danger {
  color: var(--s-danger);
}
.ui-menu__check {
  display: grid;
  width: 14px;
  flex-shrink: 0;
  place-items: center;
  color: var(--s-accent);
}
.ui-menu__icon {
  flex-shrink: 0;
  color: var(--s-fg-3);
}
.ui-menu__item.is-danger .ui-menu__icon {
  color: inherit;
}
.ui-menu__label {
  overflow: hidden;
  flex: 1;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ui-menu__key {
  color: var(--s-fg-3);
  font-family: var(--s-mono);
  font-size: 11px;
}
.ui-menu__sep {
  height: 1px;
  flex-shrink: 0;
  margin: 4px 6px;
  background: var(--s-line);
}
</style>
