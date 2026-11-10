<script setup lang="ts">
import UiNumber from './UiNumber.vue'

withDefaults(
  defineProps<{ modelValue: number; min: number; max: number; step?: number; precision?: number; unit?: string }>(),
  { step: 0.01, precision: 2, unit: '' },
)
const emit = defineEmits<{ update: [value: number]; commit: [] }>()
</script>

<template>
  <div class="ui-slider">
    <input
      type="range"
      :min="min"
      :max="max"
      :step="step"
      :value="modelValue"
      :style="{ '--fill': `${((modelValue - min) / (max - min)) * 100}%` }"
      @input="emit('update', Number(($event.target as HTMLInputElement).value))"
      @change="emit('commit')"
    />
    <UiNumber
      class="ui-slider__number"
      :model-value="modelValue"
      :min="min"
      :max="max"
      :step="step"
      :precision="precision"
      :unit="unit"
      @update="emit('update', $event)"
      @commit="emit('commit')"
    />
  </div>
</template>

<style scoped>
.ui-slider {
  display: flex;
  flex: 1;
  min-width: 0;
  align-items: center;
  gap: 8px;
}
.ui-slider input[type='range'] {
  min-width: 0;
  flex: 1;
  height: 16px;
  margin: 0;
  appearance: none;
  background: transparent;
  cursor: pointer;
}
.ui-slider input[type='range']::-webkit-slider-runnable-track {
  height: 3px;
  border-radius: 2px;
  background: linear-gradient(to right, var(--s-accent) var(--fill), var(--s-line-2) var(--fill));
}
.ui-slider input[type='range']::-webkit-slider-thumb {
  width: 12px;
  height: 12px;
  margin-top: -4.5px;
  appearance: none;
  border: 2px solid var(--s-panel);
  border-radius: 50%;
  background: var(--s-knob);
  box-shadow: 0 0 0 1px rgb(0 0 0 / 0.3);
}
.ui-slider input[type='range']::-moz-range-track {
  height: 3px;
  border-radius: 2px;
  background: var(--s-line-2);
}
.ui-slider input[type='range']::-moz-range-progress {
  height: 3px;
  border-radius: 2px;
  background: var(--s-accent);
}
.ui-slider input[type='range']::-moz-range-thumb {
  width: 10px;
  height: 10px;
  border: 2px solid var(--s-panel);
  border-radius: 50%;
  background: var(--s-knob);
}
.ui-slider__number {
  width: 64px;
  flex-shrink: 0;
}
</style>
