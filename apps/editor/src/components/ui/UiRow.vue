<script setup lang="ts">
defineProps<{ label?: string; hint?: string; stack?: boolean }>()
</script>

<template>
  <div class="ui-row" :class="{ 'is-stack': stack }">
    <span v-if="label" class="ui-row__label" :title="hint || label">{{ label }}</span>
    <div class="ui-row__control"><slot /></div>
  </div>
</template>

<style scoped>
.ui-row {
  display: grid;
  grid-template-columns: 78px minmax(0, 1fr);
  align-items: center;
  gap: 8px;
  min-height: 28px;
  padding: 2px 12px;
}
.ui-row.is-stack {
  grid-template-columns: 1fr;
  gap: 4px;
}
.ui-row__label {
  overflow: hidden;
  color: var(--s-fg-2);
  font-size: 11.5px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ui-row__control {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 4px;
}
</style>
