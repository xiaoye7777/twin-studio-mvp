<script setup lang="ts">
import { Monitor, Moon, Sun } from 'lucide-vue-next'
import { computed } from 'vue'
import { useTheme } from '@/theme/themes'
import type { MenuSections } from './menu'
import UiDropdown from './UiDropdown.vue'

/** 主题切换按钮：深色、浅色或跟随系统。 */
withDefaults(defineProps<{ align?: 'start' | 'end'; label?: boolean }>(), { align: 'end', label: false })
const { themes, choice, active, setTheme } = useTheme()

const sections = computed<MenuSections>(() => [
  themes.map(theme => ({
    label: theme.name,
    checked: choice.value === theme.id,
    action: () => setTheme(theme.id),
    testid: `theme-option-${theme.id}`,
  })),
  [{ label: '跟随系统', checked: choice.value === 'system', action: () => setTheme('system') }],
])
const icon = computed(() => (choice.value === 'system' ? Monitor : active.value.mode === 'dark' ? Moon : Sun))
</script>

<template>
  <UiDropdown :sections="sections" :align="align" :width="150">
    <template #default="{ toggle, open }">
      <button
        class="theme-switcher"
        :class="{ 'is-open': open, 'has-label': label }"
        :title="`界面主题：${choice === 'system' ? '跟随系统' : active.name}`"
        data-testid="theme-switcher"
        @click="toggle"
      >
        <component :is="icon" :size="15" />
        <span v-if="label">{{ choice === 'system' ? '跟随系统' : active.name }}</span>
      </button>
    </template>
  </UiDropdown>
</template>

<style scoped>
.theme-switcher {
  display: inline-flex;
  height: 26px;
  min-width: 26px;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 0 6px;
  border: 0;
  border-radius: var(--s-radius-sm);
  background: transparent;
  color: var(--s-fg-2);
  font-size: 12px;
  cursor: pointer;
}
.theme-switcher:hover,
.theme-switcher.is-open {
  background: var(--s-hover);
  color: var(--s-fg);
}
.theme-switcher.has-label {
  padding: 0 10px;
}
</style>
