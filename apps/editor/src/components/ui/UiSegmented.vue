<script setup lang="ts" generic="T extends string | number | boolean">
defineProps<{ modelValue: T; options: ReadonlyArray<{ value: T; label: string; title?: string }> }>()
const emit = defineEmits<{ 'update:modelValue': [value: T] }>()
</script>

<template>
  <div class="ui-seg" role="radiogroup">
    <button
      v-for="option in options"
      :key="String(option.value)"
      type="button"
      role="radio"
      :aria-checked="option.value === modelValue"
      :title="option.title"
      class="ui-seg__item"
      :class="{ 'is-active': option.value === modelValue }"
      @click="emit('update:modelValue', option.value)"
    >
      {{ option.label }}
    </button>
  </div>
</template>

<style scoped>
.ui-seg {
  display: flex;
  flex: 1;
  min-width: 0;
  padding: 2px;
  border: 1px solid var(--s-line-2);
  border-radius: var(--s-radius-sm);
  background: var(--s-field);
}
.ui-seg__item {
  flex: 1;
  min-width: 0;
  height: 20px;
  padding: 0 6px;
  border: 0;
  border-radius: 3px;
  background: transparent;
  color: var(--s-fg-3);
  font-size: 11px;
  white-space: nowrap;
  cursor: pointer;
}
.ui-seg__item:hover {
  color: var(--s-fg-2);
}
.ui-seg__item.is-active {
  background: var(--s-active);
  color: var(--s-fg);
}
</style>
