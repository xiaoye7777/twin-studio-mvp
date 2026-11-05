<script setup lang="ts">
/**
 * 静态数据的一个值：按变量类型显示数字框、是/否下拉或文本框。改完（回车或失焦）就生效；清空表示不设值。
 */
import type { TwinVariableDataType } from '@twin-studio/core'

defineProps<{ dataType: TwinVariableDataType; value: number | string | boolean | undefined; testid?: string }>()
const emit = defineEmits<{ commit: [value: number | string | boolean | null] }>()

function commitText(text: string, dataType: TwinVariableDataType): void {
  const trimmed = text.trim()
  if (!trimmed) return emit('commit', null)
  if (dataType === 'number') {
    const number = Number(trimmed)
    if (Number.isFinite(number)) emit('commit', number)
  } else emit('commit', text)
}
</script>

<template>
  <select
    v-if="dataType === 'boolean'"
    class="s-select static-value"
    :value="value === undefined ? '' : String(value)"
    :data-testid="testid"
    @change="
      emit(
        'commit',
        ($event.target as HTMLSelectElement).value === ''
          ? null
          : ($event.target as HTMLSelectElement).value === 'true',
      )
    "
  >
    <option value="">—</option>
    <option value="true">是</option>
    <option value="false">否</option>
  </select>
  <input
    v-else
    class="s-input s-mono static-value"
    :type="dataType === 'number' ? 'number' : 'text'"
    :value="value ?? ''"
    placeholder="—"
    :data-testid="testid"
    @change="commitText(($event.target as HTMLInputElement).value, dataType)"
    @keydown.enter="($event.target as HTMLInputElement).blur()"
  />
</template>

<style scoped>
.static-value {
  height: 24px;
  padding: 0 6px;
  border-color: color-mix(in srgb, var(--s-data) 45%, transparent);
}
</style>
