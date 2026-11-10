<script setup lang="ts">
import { ref, watch } from 'vue'

const props = defineProps<{ modelValue: string }>()
/** 选色过程中发 `update`（实时预览），关掉取色器时发 `commit`（算一步撤销）。 */
const emit = defineEmits<{ update: [value: string]; commit: [] }>()
const text = ref(props.modelValue)
watch(
  () => props.modelValue,
  value => (text.value = value),
)
function applyText(): void {
  const value = text.value.trim()
  if (/^#[0-9a-f]{6}$/i.test(value) && value.toLowerCase() !== props.modelValue.toLowerCase()) {
    emit('update', value.toLowerCase())
    emit('commit')
  } else text.value = props.modelValue
}
</script>

<template>
  <div class="ui-color">
    <label class="ui-color__swatch" :style="{ background: modelValue }">
      <input
        type="color"
        :value="modelValue"
        @input="emit('update', ($event.target as HTMLInputElement).value)"
        @change="emit('commit')"
      />
    </label>
    <input
      v-model="text"
      class="ui-color__text"
      maxlength="7"
      @blur="applyText"
      @keydown.enter.prevent="($event.target as HTMLInputElement).blur()"
    />
  </div>
</template>

<style scoped>
.ui-color {
  display: flex;
  height: 24px;
  flex: 1;
  min-width: 0;
  align-items: center;
  border: 1px solid var(--s-line-2);
  border-radius: var(--s-radius-sm);
  background: var(--s-field);
}
.ui-color:focus-within {
  border-color: var(--s-accent-line);
}
.ui-color__swatch {
  position: relative;
  width: 18px;
  height: 18px;
  flex-shrink: 0;
  margin: 0 3px;
  border-radius: 3px;
  box-shadow: inset 0 0 0 1px var(--s-line-2);
  cursor: pointer;
}
.ui-color__swatch input {
  position: absolute;
  inset: 0;
  opacity: 0;
  cursor: pointer;
}
.ui-color__text {
  width: 100%;
  min-width: 0;
  height: 100%;
  padding: 0 4px;
  border: 0;
  background: transparent;
  outline: none;
  font-family: var(--s-mono);
  font-size: 11px;
  text-transform: lowercase;
}
</style>
