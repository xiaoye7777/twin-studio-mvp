<script setup lang="ts">
import { computed, ref, watch } from 'vue'

const props = withDefaults(
  defineProps<{
    modelValue: number
    label?: string
    labelColor?: string
    step?: number
    precision?: number
    min?: number
    max?: number
    unit?: string
    disabled?: boolean
  }>(),
  { label: '', labelColor: '', step: 0.1, precision: 2, min: -Infinity, max: Infinity, unit: '', disabled: false },
)
/** `update` fires while dragging (live) and on entry; `commit` ends the edit (one undo step). */
const emit = defineEmits<{ update: [value: number]; commit: [] }>()

const text = ref('')
const editing = ref(false)
const dragging = ref(false)
const shown = computed(() => format(props.modelValue))
watch(shown, value => !editing.value && (text.value = value), { immediate: true })

function format(value: number): string {
  if (!Number.isFinite(value)) return '—'
  const fixed = value.toFixed(props.precision)
  return fixed.includes('.') ? fixed.replace(/\.?0+$/, '') : fixed
}
function clamp(value: number): number {
  return Math.min(props.max, Math.max(props.min, value))
}
function apply(): void {
  editing.value = false
  const value = Number.parseFloat(text.value)
  if (Number.isFinite(value) && clamp(value) !== props.modelValue) {
    emit('update', clamp(value))
    emit('commit')
  }
  text.value = shown.value
}

let startX = 0
let startValue = 0
function onPointerDown(event: PointerEvent): void {
  if (props.disabled || event.button !== 0) return
  startX = event.clientX
  startValue = props.modelValue
  dragging.value = false
  const target = event.currentTarget as HTMLElement
  target.setPointerCapture(event.pointerId)
  const move = (moveEvent: PointerEvent) => {
    const dx = moveEvent.clientX - startX
    if (!dragging.value && Math.abs(dx) < 3) return
    dragging.value = true
    const factor = moveEvent.shiftKey ? 10 : moveEvent.altKey ? 0.1 : 1
    const raw = startValue + dx * props.step * factor
    const snapped = Math.round(raw / (props.step * factor)) * props.step * factor
    emit('update', clamp(Number(snapped.toFixed(6))))
  }
  const up = () => {
    target.removeEventListener('pointermove', move)
    target.removeEventListener('pointerup', up)
    target.removeEventListener('pointercancel', up)
    if (dragging.value) emit('commit')
    dragging.value = false
  }
  target.addEventListener('pointermove', move)
  target.addEventListener('pointerup', up)
  target.addEventListener('pointercancel', up)
}
</script>

<template>
  <label class="ui-number" :class="{ 'is-disabled': disabled, 'is-dragging': dragging }">
    <span
      v-if="label"
      class="ui-number__label"
      :style="labelColor ? { color: labelColor } : undefined"
      title="拖动调整（Shift 粗调，Alt 微调）"
      @pointerdown="onPointerDown"
      >{{ label }}</span
    >
    <input
      v-model="text"
      class="ui-number__input"
      :disabled="disabled"
      inputmode="decimal"
      @focus="editing = true"
      @blur="apply"
      @keydown.enter.prevent="($event.target as HTMLInputElement).blur()"
      @keydown.esc="((text = shown), ($event.target as HTMLInputElement).blur())"
    />
    <span v-if="unit" class="ui-number__unit">{{ unit }}</span>
  </label>
</template>

<style scoped>
.ui-number {
  display: flex;
  height: 24px;
  min-width: 0;
  align-items: center;
  border: 1px solid var(--s-line-2);
  border-radius: var(--s-radius-sm);
  background: var(--s-field);
  transition: border-color 120ms ease;
}
.ui-number:hover {
  border-color: var(--s-line-strong);
}
.ui-number:focus-within {
  border-color: var(--s-accent-line);
}
.ui-number__label {
  display: grid;
  height: 100%;
  min-width: 18px;
  flex-shrink: 0;
  place-items: center;
  padding: 0 4px;
  border-right: 1px solid var(--s-line);
  color: var(--s-fg-3);
  font-size: 10px;
  font-weight: 600;
  cursor: ew-resize;
}
.ui-number.is-dragging .ui-number__label {
  background: var(--s-accent-soft);
}
.ui-number__input {
  width: 100%;
  min-width: 0;
  height: 100%;
  padding: 0 6px;
  border: 0;
  background: transparent;
  outline: none;
  font-family: var(--s-mono);
  font-size: 11px;
}
.ui-number__unit {
  padding-right: 6px;
  color: var(--s-fg-3);
  font-size: 10.5px;
}
.ui-number.is-disabled {
  opacity: 0.5;
}
</style>
