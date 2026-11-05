<script setup lang="ts">
defineProps<{ modelValue: boolean; disabled?: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>()
</script>

<template>
  <button
    type="button"
    role="switch"
    class="ui-switch"
    :class="{ 'is-on': modelValue }"
    :aria-checked="modelValue"
    :disabled="disabled"
    @click="emit('update:modelValue', !modelValue)"
  >
    <span class="ui-switch__knob" />
  </button>
</template>

<style scoped>
.ui-switch {
  position: relative;
  width: 28px;
  height: 16px;
  flex-shrink: 0;
  padding: 0;
  border: 0;
  border-radius: 8px;
  background: var(--s-line-strong);
  cursor: pointer;
  transition: background-color 140ms ease;
}
.ui-switch.is-on {
  background: var(--s-accent);
}
.ui-switch__knob {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: var(--s-knob);
  transition: transform 140ms ease;
}
.ui-switch.is-on .ui-switch__knob {
  transform: translateX(12px);
}
.ui-switch:disabled {
  opacity: 0.4;
  cursor: default;
}
</style>
