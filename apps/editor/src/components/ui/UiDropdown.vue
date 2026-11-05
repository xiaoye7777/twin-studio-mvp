<script setup lang="ts">
import { ref } from 'vue'
import type { MenuSections } from './menu'
import UiMenu from './UiMenu.vue'

/**
 * A button that opens a menu below it. The trigger is the default slot; it receives `open` (for an
 * active style) and `toggle`.
 *
 *   <UiDropdown :sections="items" align="end">
 *     <template #default="{ toggle }"><button @click="toggle">更多</button></template>
 *   </UiDropdown>
 */
const props = withDefaults(
  defineProps<{ sections: MenuSections; align?: 'start' | 'end'; width?: number; testid?: string }>(),
  { align: 'start', width: 200, testid: undefined },
)
const root = ref<HTMLElement>()
const open = ref(false)
const at = ref({ x: 0, y: 0 })

function toggle(): void {
  if (open.value) return void (open.value = false)
  const rect = root.value!.getBoundingClientRect()
  at.value = { x: props.align === 'end' ? rect.right - props.width : rect.left, y: rect.bottom + 4 }
  open.value = true
}
</script>

<template>
  <span ref="root" class="ui-dropdown">
    <slot :open="open" :toggle="toggle" />
    <UiMenu
      v-if="open"
      :sections="sections"
      :x="at.x"
      :y="at.y"
      :width="width"
      :testid="testid"
      :anchor="root"
      @close="open = false"
    />
  </span>
</template>

<style scoped>
.ui-dropdown {
  display: inline-flex;
}
</style>
