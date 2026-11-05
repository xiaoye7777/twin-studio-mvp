<script setup lang="ts">
/** 填接口字段名的输入框：可以手写，试请求之后也能从返回的字段里选。 */
import { useId } from 'vue'

defineProps<{ modelValue: string; fields?: readonly string[]; placeholder?: string; testid?: string }>()
const emit = defineEmits<{ commit: [value: string] }>()
const listId = useId()
</script>

<template>
  <input
    class="s-input s-mono"
    :value="modelValue"
    :placeholder="placeholder"
    :list="fields?.length ? listId : undefined"
    :data-testid="testid"
    @change="emit('commit', ($event.target as HTMLInputElement).value.trim())"
    @keydown.enter="($event.target as HTMLInputElement).blur()"
  />
  <datalist v-if="fields?.length" :id="listId">
    <option v-for="field in fields" :key="field" :value="field" />
  </datalist>
</template>
