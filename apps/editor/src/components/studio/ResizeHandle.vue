<script setup lang="ts">
const props = defineProps<{ edge: 'left' | 'right' | 'top'; min: number; max: number }>()
const size = defineModel<number>({ required: true })
let drag: { pointer: number; origin: number; size: number } | null = null
function start(event: PointerEvent) {
  if (event.button !== 0 || drag) return
  const handle = event.currentTarget as HTMLElement
  const panel = handle.parentElement!.getBoundingClientRect()
  const vertical = props.edge === 'top'
  drag = {
    pointer: event.pointerId,
    origin: vertical ? event.clientY : event.clientX,
    size: vertical ? panel.height : panel.width,
  }
  handle.setPointerCapture(event.pointerId)
}
function move(event: PointerEvent) {
  if (drag?.pointer !== event.pointerId) return
  const delta = (props.edge === 'top' ? event.clientY : event.clientX) - drag.origin
  const value = drag.size + (props.edge === 'right' ? delta : -delta)
  size.value = Math.min(props.max, Math.max(props.min, Math.round(value)))
}
</script>

<template>
  <div
    class="resize-handle"
    :class="`is-${edge}`"
    role="separator"
    :aria-orientation="edge === 'top' ? 'horizontal' : 'vertical'"
    title="拖动调整大小"
    @pointerdown.prevent="start"
    @pointermove="move"
    @lostpointercapture="drag = null"
  />
</template>

<style scoped>
.resize-handle {
  position: absolute;
  z-index: 15;
  touch-action: none;
}
.resize-handle::after {
  position: absolute;
  background: var(--s-accent);
  opacity: 0;
  transition: opacity 120ms ease;
  content: '';
}
.resize-handle:hover::after,
.resize-handle:active::after {
  opacity: 0.8;
}
.resize-handle.is-left,
.resize-handle.is-right {
  top: 0;
  bottom: 0;
  width: 7px;
  cursor: col-resize;
}
.resize-handle.is-right {
  right: -4px;
}
.resize-handle.is-left {
  left: -4px;
}
.resize-handle.is-left::after,
.resize-handle.is-right::after {
  top: 0;
  bottom: 0;
  left: 3px;
  width: 1px;
}
.resize-handle.is-top {
  top: -4px;
  right: 0;
  left: 0;
  height: 7px;
  cursor: row-resize;
}
.resize-handle.is-top::after {
  top: 3px;
  right: 0;
  left: 0;
  height: 1px;
}
</style>
