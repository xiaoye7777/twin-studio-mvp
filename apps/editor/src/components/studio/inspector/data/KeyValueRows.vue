<script setup lang="ts">
/**
 * 键值对列表：查询参数、请求头。名字像认证信息的（Authorization、token……）不让写，因为场景文件会随项目
 * 分发；认证放在「认证」里选择。
 */
import { Plus, X } from 'lucide-vue-next'
import { ref } from 'vue'
import { looksLikeSecret, type SourceKeyValue } from '@twin-studio/core'
import UiText from '@/components/ui/UiText.vue'

const props = defineProps<{ items: readonly SourceKeyValue[]; keyHint: string; testid?: string }>()
const emit = defineEmits<{ update: [items: SourceKeyValue[]] }>()
const error = ref('')

function setKey(index: number, key: string): void {
  if (looksLikeSecret(key)) {
    error.value = `「${key}」看起来是认证信息，不能写进场景文件，请在「认证」里选择`
    return
  }
  error.value = ''
  emit(
    'update',
    props.items.map((item, at) => (at === index ? { ...item, key: key.trim() } : { ...item })),
  )
}
function setValue(index: number, value: string): void {
  emit(
    'update',
    props.items.map((item, at) => (at === index ? { ...item, value } : { ...item })),
  )
}
const add = () => emit('update', [...props.items.map(item => ({ ...item })), { key: '', value: '' }])
const remove = (index: number) =>
  emit(
    'update',
    props.items.filter((_, at) => at !== index).map(item => ({ ...item })),
  )
</script>

<template>
  <div class="rows">
    <div v-for="(item, index) in items" :key="index" class="rows__row">
      <UiText
        :model-value="item.key"
        mono
        :placeholder="keyHint"
        :data-testid="testid && `${testid}-key-${index}`"
        @commit="setKey(index, $event)"
      />
      <UiText
        :model-value="item.value"
        mono
        placeholder="值"
        :data-testid="testid && `${testid}-value-${index}`"
        @commit="setValue(index, $event)"
      />
      <button class="s-icon-btn" title="删除" @click="remove(index)"><X :size="12" /></button>
    </div>
    <p v-if="error" class="rows__error">{{ error }}</p>
    <button class="s-btn s-btn--sm" :data-testid="testid && `${testid}-add`" @click="add">
      <Plus :size="11" />添加
    </button>
  </div>
</template>

<style scoped>
.rows {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  padding: 0 12px;
}
.rows__row {
  display: grid;
  width: 100%;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) 22px;
  align-items: center;
  gap: 4px;
}
.rows__error {
  margin: 0;
  color: var(--s-danger);
  font-size: 11px;
}
</style>
