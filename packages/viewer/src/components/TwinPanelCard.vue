<script setup lang="ts">
/*
 * 数据面板的卡片：标题加一列「名字 + 数值」。
 * 编辑器的预览和 TwinSceneViewer 都用它，所以两边看到的一样。位置由外面给（跟着对象走）。
 */
import { computed, ref } from 'vue'
import type { PanelAnchor, PanelView } from '@twin-studio/core'

const props = defineProps<{ view: PanelView; anchor: PanelAnchor }>()
defineEmits<{ close: [] }>()
const root = ref<HTMLElement>()

/** 面板画在对象上方；对象靠近画布边缘时往里收，不让面板跑出画面。 */
const position = computed(() => {
  const element = root.value
  const parent = element?.parentElement
  if (!element || !parent) return { left: `${props.anchor.x}px`, top: `${props.anchor.y}px` }
  const halfWidth = element.offsetWidth / 2 + 8
  const height = element.offsetHeight + 20
  return {
    left: `${Math.min(Math.max(props.anchor.x, halfWidth), parent.clientWidth - halfWidth)}px`,
    top: `${Math.min(Math.max(props.anchor.y, height), parent.clientHeight - 8)}px`,
  }
})
</script>

<template>
  <div v-show="anchor.visible" ref="root" class="twin-panel" data-testid="twin-panel" :style="position">
    <header class="twin-panel__head">
      <strong class="twin-panel__title">{{ view.title }}</strong>
      <button type="button" class="twin-panel__close" aria-label="关闭面板" @click="$emit('close')">×</button>
    </header>
    <dl v-if="view.rows.length" class="twin-panel__rows">
      <div v-for="row in view.rows" :key="row.id" class="twin-panel__row">
        <dt>{{ row.label }}</dt>
        <dd>{{ row.value }}</dd>
      </div>
    </dl>
    <p v-else class="twin-panel__empty">这个面板还没有字段</p>
  </div>
</template>

<style>
.twin-panel {
  position: absolute;
  z-index: 5;
  min-width: 180px;
  max-width: 280px;
  transform: translate(-50%, calc(-100% - 12px));
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 6px;
  background: rgba(16, 22, 26, 0.92);
  color: #e8ecee;
  font:
    13px/1.5 system-ui,
    'PingFang SC',
    'Microsoft YaHei',
    sans-serif;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.35);
}
.twin-panel__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 7px 8px 7px 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}
.twin-panel__title {
  overflow: hidden;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.twin-panel__close {
  flex: none;
  width: 20px;
  height: 20px;
  padding: 0;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: inherit;
  font-size: 16px;
  line-height: 1;
  cursor: pointer;
  opacity: 0.7;
}
.twin-panel__close:hover {
  background: rgba(255, 255, 255, 0.12);
  opacity: 1;
}
.twin-panel__rows {
  margin: 0;
  padding: 6px 12px 8px;
}
.twin-panel__row {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  padding: 2px 0;
}
.twin-panel__row dt {
  color: rgba(232, 236, 238, 0.65);
}
.twin-panel__row dd {
  margin: 0;
  font-variant-numeric: tabular-nums;
  font-weight: 600;
  white-space: nowrap;
}
.twin-panel__empty {
  margin: 0;
  padding: 8px 12px;
  color: rgba(232, 236, 238, 0.65);
}
</style>
