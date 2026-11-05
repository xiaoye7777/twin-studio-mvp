<script setup lang="ts">
import { useShell } from '@/studio/shell'
import CameraPanel from './CameraPanel.vue'
import PanelTemplates from './PanelTemplates.vue'
import SceneTree from './SceneTree.vue'

const shell = useShell()
const tabs = [
  { id: 'scene', label: '场景' },
  { id: 'cameras', label: '镜头' },
  { id: 'panels', label: '面板' },
] as const
</script>

<template>
  <aside class="s-panel">
    <div class="s-panel-head">
      <button
        v-for="tab in tabs"
        :key="tab.id"
        class="s-tab"
        :class="{ 'is-active': shell.leftTab === tab.id }"
        :data-testid="`left-tab-${tab.id}`"
        @click="shell.leftTab = tab.id"
      >
        {{ tab.label }}
      </button>
    </div>
    <SceneTree v-if="shell.leftTab === 'scene'" />
    <CameraPanel v-else-if="shell.leftTab === 'cameras'" />
    <PanelTemplates v-else />
  </aside>
</template>
