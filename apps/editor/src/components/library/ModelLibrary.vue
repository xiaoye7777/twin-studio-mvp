<script setup lang="ts">
import { ElMessage, ElMessageBox } from 'element-plus'
import { Box, Upload } from 'lucide-vue-next'
import { onMounted, ref } from 'vue'
import { adapter } from '@/api/adapter'
import { ApiError } from '@/api/http'
import type { LibraryModel } from '@/api/repositories'
import { confirmAction } from '@/components/ui/confirm'
import { useAssetStore } from '@/stores/assets'
import ModelCard from './ModelCard.vue'
import ModelUploadDialog from './ModelUploadDialog.vue'

const props = defineProps<{ compact?: boolean; inScene?: (id: string) => boolean }>()
const store = useAssetStore()
const uploading = ref(false)
const loading = ref(true)
const error = ref('')
async function load(): Promise<void> {
  loading.value = true
  error.value = ''
  try {
    await store.refresh()
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '模型列表加载失败'
  } finally {
    loading.value = false
  }
}
onMounted(load)

async function rename(model: LibraryModel): Promise<void> {
  const result = await ElMessageBox.prompt('模型标题', '修改标题', {
    inputValue: model.title,
    confirmButtonText: '保存',
    cancelButtonText: '取消',
    customClass: 'studio-dialog',
    inputValidator: value => (!!value?.trim() && value.trim().length <= 100) || '请输入 1–100 个字符',
  }).catch(() => null)
  if (!result || result.value.trim() === model.title) return
  try {
    await store.rename(model.id, result.value.trim())
  } catch (cause) {
    ElMessage.error(cause instanceof Error ? cause.message : '修改标题失败')
  }
}

async function remove(model: LibraryModel): Promise<void> {
  const note = props.inScene?.(model.id) ? '当前场景正在使用这个模型，删除后下次打开将无法加载它。' : ''
  if (!(await confirmAction(`删除「${model.title}」？${note}`, { title: '删除模型', confirm: '删除', danger: true })))
    return
  try {
    try {
      await store.remove(model.id)
    } catch (cause) {
      if (!(cause instanceof ApiError && adapter.isAssetInUse(cause.result))) throw cause
      const names = (cause.result.data as { projects?: { name: string }[] })?.projects?.map(p => p.name).join('、')
      const message = `「${model.title}」正在被${names || '其他场景'}使用，删除后这些场景将无法加载它。`
      if (await confirmAction(message, { title: '删除使用中的模型', confirm: '仍然删除', danger: true }))
        await store.remove(model.id, true)
    }
  } catch (cause) {
    ElMessage.error(cause instanceof Error ? cause.message : '删除失败')
  }
}
</script>

<template>
  <section class="library" :class="{ 'dock s-panel': compact }" :data-testid="compact ? 'asset-dock' : 'asset-library'">
    <header :class="compact ? 's-panel-head' : 'library-head'">
      <div v-if="!compact">
        <h1>资源库</h1>
        <p>{{ store.assets.length }} 个模型，所有场景共用</p>
      </div>
      <span v-else class="dock-title">模型资源</span>
      <button
        class="s-btn"
        :class="compact ? 's-btn--sm' : 's-btn--primary'"
        data-testid="upload-model"
        @click="uploading = true"
      >
        <Upload :size="compact ? 12 : 14" />上传模型
      </button>
    </header>
    <p v-if="error" class="status" role="alert">
      {{ error }} <button class="s-btn s-btn--sm" @click="load">重试</button>
    </p>
    <div v-if="store.assets.length" class="models">
      <ModelCard
        v-for="model in store.assets"
        :key="model.id"
        :model="model"
        :compact="compact"
        @rename="rename(model)"
        @remove="remove(model)"
      />
    </div>
    <div v-else-if="!error" class="status"><Box :size="18" />{{ loading ? '正在加载模型…' : '暂无模型' }}</div>
    <ModelUploadDialog v-if="uploading" @close="uploading = false" />
  </section>
</template>
<style scoped>
.library {
  max-width: 1480px;
}
.library-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: 20px;
  margin-bottom: 24px;
}
h1 {
  margin: 0;
  font-size: 22px;
  font-weight: 650;
}
.library-head p {
  margin: 4px 0 0;
  color: var(--s-fg-3);
}
.library-head button {
  height: 32px;
  padding: 0 14px;
}
.models {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(165px, 1fr));
  gap: 12px;
}
.status {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px;
  color: var(--s-fg-3);
}
.dock {
  max-width: none;
  flex: none;
  height: 148px;
  border-top: 1px solid var(--s-line);
}
.dock-title {
  margin-right: auto;
  font-size: 12px;
  font-weight: 600;
}
.dock .models {
  display: flex;
  min-height: 0;
  flex: 1;
  gap: 8px;
  padding: 7px 10px;
  overflow-x: auto;
}
</style>
