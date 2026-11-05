<script setup lang="ts">
/** 新建场景和编辑场景信息共用的对话框：标题、描述。 */
import { ref, watch } from 'vue'

const props = defineProps<{
  modelValue: boolean
  title: string
  confirmText: string
  /** 打开时填进输入框的内容。 */
  initial?: { name: string; description: string } | null
  busy?: boolean
}>()
const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  submit: [value: { name: string; description: string }]
}>()
const name = ref('')
const description = ref('')
const error = ref('')

watch(
  () => props.modelValue,
  open => {
    if (!open) return
    name.value = props.initial?.name ?? ''
    description.value = props.initial?.description ?? ''
    error.value = ''
  },
)

function submit(): void {
  if (props.busy) return
  const text = name.value.trim()
  if (text.length < 2 || text.length > 40) {
    error.value = '标题为 2–40 个字符'
    return
  }
  emit('submit', { name: text, description: description.value.trim() })
}
</script>

<template>
  <el-dialog
    :model-value="modelValue"
    :title="title"
    width="420px"
    append-to-body
    class="studio-dialog"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <label class="field">
      <span>标题</span>
      <input
        v-model="name"
        class="s-input"
        maxlength="40"
        placeholder="例如：深圳储能产业园"
        autofocus
        data-testid="project-name-input"
        @keydown.enter.prevent="submit"
      />
      <small v-if="error" class="field__error">{{ error }}</small>
    </label>
    <label class="field">
      <span>描述</span>
      <textarea
        v-model="description"
        class="s-textarea"
        rows="3"
        maxlength="200"
        placeholder="选填：这个场景是做什么的"
        data-testid="project-description-input"
      />
    </label>
    <template #footer>
      <button class="s-btn" @click="emit('update:modelValue', false)">取消</button>
      <button class="s-btn s-btn--primary" :disabled="busy" data-testid="project-create" @click="submit">
        {{ confirmText }}
      </button>
    </template>
  </el-dialog>
</template>

<style scoped>
.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  color: var(--s-fg-2);
  font-size: 12px;
}
.field {
  margin-top: 8px;
}
.field + .field {
  margin-top: 14px;
}
.field .s-input {
  height: 32px;
  font-size: 13px;
}
.field .s-textarea {
  font-size: 13px;
  resize: vertical;
}
.field__error {
  color: var(--s-danger);
}
</style>
