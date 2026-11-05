<script setup lang="ts">
import { ref, watch } from 'vue'

const props = withDefaults(
  defineProps<{ modelValue: string; placeholder?: string; multiline?: boolean; mono?: boolean }>(),
  {
    placeholder: '',
    multiline: false,
    mono: false,
  },
)
/** Commits on blur / Enter, so each edit is one undo step. */
const emit = defineEmits<{ commit: [value: string] }>()
const text = ref(props.modelValue)
watch(
  () => props.modelValue,
  value => (text.value = value),
)
function apply(): void {
  if (text.value !== props.modelValue) emit('commit', text.value)
}
</script>

<template>
  <textarea
    v-if="multiline"
    v-model="text"
    class="s-textarea"
    :class="{ 's-mono': mono }"
    :placeholder="placeholder"
    rows="2"
    @blur="apply"
  />
  <input
    v-else
    v-model="text"
    class="s-input"
    :class="{ 's-mono': mono }"
    :placeholder="placeholder"
    @blur="apply"
    @keydown.enter.prevent="($event.target as HTMLInputElement).blur()"
    @keydown.esc="((text = modelValue), ($event.target as HTMLInputElement).blur())"
  />
</template>
