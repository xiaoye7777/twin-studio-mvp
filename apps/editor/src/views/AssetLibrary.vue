<script setup lang="ts">
/** 「资源库」页面：内置模型和上传的模型。 */
import { ElMessage } from 'element-plus'
import { Box, Trash2, Upload } from 'lucide-vue-next'
import { computed, onMounted, ref } from 'vue'
import { ApiError } from '@/api/http'
import { adapter } from '@/api/adapter'
import { confirmAction } from '@/components/ui/confirm'
import { builtinModels, builtinThumbnailUrl } from '@/library/builtinModels'
import { useAssetStore } from '@/stores/assets'

const store = useAssetStore()
const fileInput = ref<HTMLInputElement>()
const uploading = ref(false)
const builtinFiles = new Set(builtinModels.map(model => model.file))
/** 上传的模型；内置模型用过之后也会进资源库，这里不重复显示。 */
const uploaded = computed(() => store.assets.filter(asset => !builtinFiles.has(asset.name)))

onMounted(() => {
  store.refresh().catch(error => ElMessage.error(error instanceof Error ? error.message : '加载失败'))
})

function size(bytes: number): string {
  return bytes > 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`
}

async function upload(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const files = [...(input.files ?? [])]
  input.value = ''
  uploading.value = true
  try {
    for (const file of files) {
      if (file.name.toLowerCase().endsWith('.glb')) await store.upload(file)
      else ElMessage.warning(`${file.name}：只支持 .glb 模型`)
    }
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '上传失败')
  } finally {
    uploading.value = false
  }
}

async function remove(id: string, name: string): Promise<void> {
  if (!(await confirmAction(`删除「${name}」？`, { title: '删除模型', confirm: '删除', danger: true }))) return
  try {
    await store.remove(id)
  } catch (error) {
    if (!(error instanceof ApiError && adapter.isAssetInUse(error.result))) {
      ElMessage.error(error instanceof Error ? error.message : '删除失败')
      return
    }
    const names = (error.result.data as { projects?: Array<{ name: string }> })?.projects?.map(item => item.name) ?? []
    const message = `「${name}」正在被 ${names.join('、')} 使用，删除后这些场景中的模型将无法加载。确定删除？`
    if (await confirmAction(message, { title: '删除模型', confirm: '仍然删除', danger: true }))
      await store.remove(id, true)
  }
}
</script>

<template>
  <section class="assets">
    <header class="assets__head">
      <div>
        <h1>资源库</h1>
        <p>{{ builtinModels.length }} 个内置模型 · {{ uploaded.length }} 个上传的模型，所有场景共用</p>
      </div>
      <button class="s-btn s-btn--primary" :disabled="uploading" data-testid="upload-model" @click="fileInput?.click()">
        <Upload :size="14" />{{ uploading ? '上传中…' : '上传模型' }}
      </button>
      <input ref="fileInput" type="file" accept=".glb" multiple hidden data-testid="upload-input" @change="upload" />
    </header>

    <h2>上传的模型</h2>
    <div v-if="uploaded.length" class="assets__grid">
      <article v-for="asset in uploaded" :key="asset.id" class="asset">
        <div class="asset__thumb"><Box :size="26" /></div>
        <div class="asset__body">
          <strong :title="asset.name">{{ asset.name.replace(/\.glb$/i, '') }}</strong>
          <span>{{ size(asset.size) }}</span>
        </div>
        <button class="s-icon-btn" title="删除" @click="remove(asset.id, asset.name)"><Trash2 :size="14" /></button>
      </article>
    </div>
    <p v-else class="assets__none">还没有上传模型。支持 .glb 文件。</p>

    <h2>内置模型</h2>
    <div class="assets__grid">
      <article v-for="model in builtinModels" :key="model.key" class="asset">
        <div class="asset__thumb"><img :src="builtinThumbnailUrl(model)" alt="" /></div>
        <div class="asset__body">
          <strong>{{ model.name }}</strong>
          <span>{{ model.style }}</span>
        </div>
      </article>
    </div>
  </section>
</template>

<style scoped>
.assets {
  max-width: 1480px;
}
.assets__head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 24px;
  margin-bottom: 20px;
}
.assets__head h1 {
  margin: 0;
  font-size: 22px;
  font-weight: 650;
}
.assets__head p {
  margin: 4px 0 0;
  color: var(--s-fg-3);
}
.assets__head .s-btn {
  height: 32px;
  padding: 0 14px;
}
h2 {
  margin: 20px 0 10px;
  color: var(--s-fg-2);
  font-size: 12.5px;
  font-weight: 600;
}
.assets__none {
  margin: 0;
  color: var(--s-fg-3);
}
.assets__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 12px;
}
.asset {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px;
  border: 1px solid var(--s-line);
  border-radius: 8px;
  background: var(--s-panel);
}
.asset__thumb {
  display: grid;
  flex: none;
  width: 56px;
  height: 56px;
  overflow: hidden;
  place-items: center;
  border-radius: 6px;
  background: var(--s-panel-2);
  color: var(--s-fg-3);
}
.asset__thumb img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}
.asset__body {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
}
.asset__body strong {
  overflow: hidden;
  font-size: 12.5px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.asset__body span {
  color: var(--s-fg-3);
  font-size: 11.5px;
}
</style>
