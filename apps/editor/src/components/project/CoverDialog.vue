<script setup lang="ts">
import { ElMessage } from 'element-plus'
import { ImagePlus } from 'lucide-vue-next'
import { onBeforeUnmount, ref } from 'vue'
import type { ProjectInfo } from '@/api/adapter'
import { useProjectStore } from '@/stores/project'

const props = defineProps<{ project: ProjectInfo }>()
const emit = defineEmits<{ close: [] }>()
const store = useProjectStore()
const input = ref<HTMLInputElement>()
const image = ref<Blob | null>(null)
const preview = ref('')
const error = ref('')
const preparing = ref(false)
const saving = ref(false)
let generation = 0

function clearPreview(): void {
  if (preview.value) URL.revokeObjectURL(preview.value)
  preview.value = ''
  image.value = null
}

onBeforeUnmount(() => {
  generation++
  clearPreview()
})

/** 预览和上传使用同一张与卡片比例一致的 JPEG。 */
async function prepareCover(file: File): Promise<Blob> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('请选择 JPG、PNG 或 WebP 图片。')
  const bitmap = await createImageBitmap(file).catch(() => {
    throw new Error('无法读取这张图片，请重新选择。')
  })
  const canvas = document.createElement('canvas')
  canvas.width = 960
  canvas.height = 540
  try {
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('无法生成封面预览。')
    const scale = Math.max(canvas.width / bitmap.width, canvas.height / bitmap.height)
    const w = canvas.width / scale
    const h = canvas.height / scale
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(bitmap, (bitmap.width - w) / 2, (bitmap.height - h) / 2, w, h, 0, 0, canvas.width, canvas.height)
  } finally {
    bitmap.close()
  }
  const result = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.86))
  if (!result || result.size > 1024 ** 2) throw new Error('图片处理失败，请换一张图片重试。')
  return result
}

async function select(event: Event): Promise<void> {
  const field = event.target as HTMLInputElement
  const file = field.files?.[0]
  if (!file) return
  field.value = ''
  const request = ++generation
  clearPreview()
  error.value = ''
  preparing.value = true
  try {
    const cover = await prepareCover(file)
    if (request !== generation) return
    preview.value = URL.createObjectURL(cover)
    image.value = cover
  } catch (cause) {
    if (request === generation) error.value = cause instanceof Error ? cause.message : '无法读取图片。'
  } finally {
    if (request === generation) preparing.value = false
  }
}

async function save(): Promise<void> {
  if (!image.value || saving.value) return
  saving.value = true
  error.value = ''
  try {
    await store.replaceCover(props.project.id, image.value)
    ElMessage.success('项目卡片封面已更新')
    emit('close')
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '上传失败，请重试。'
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <el-dialog
    :model-value="true"
    title="更改封面"
    width="min(440px, 92vw)"
    append-to-body
    class="studio-dialog"
    :show-close="!saving"
    :close-on-click-modal="!saving"
    :close-on-press-escape="!saving"
    @close="emit('close')"
  >
    <div class="cover-preview">
      <img v-if="preview || project.coverUrl" :src="preview || project.coverUrl!" :alt="project.name + '的封面预览'" />
      <ImagePlus v-else :size="32" aria-hidden="true" />
    </div>
    <div class="picker">
      <button type="button" class="s-btn" :disabled="saving" @click="input?.click()">
        <ImagePlus :size="14" />选择图片
      </button>
      <span class="s-hint">{{ preparing ? '正在生成预览…' : '支持 JPG、PNG、WebP' }}</span>
      <input
        ref="input"
        type="file"
        hidden
        accept="image/jpeg,image/png,image/webp"
        aria-label="选择封面图片"
        @change="select"
      />
    </div>
    <p v-if="error" role="alert" class="error">{{ error }}</p>
    <template #footer>
      <button class="s-btn" :disabled="saving" @click="emit('close')">取消</button>
      <button class="s-btn s-btn--primary" :disabled="!image || saving" @click="save">
        {{ saving ? '正在上传…' : '保存封面' }}
      </button>
    </template>
  </el-dialog>
</template>

<style scoped>
.cover-preview {
  display: grid;
  place-items: center;
  overflow: hidden;
  aspect-ratio: 16 / 9;
  border-radius: 6px;
  background: var(--s-panel-2);
  color: var(--s-fg-3);
}
.cover-preview img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.picker {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 12px;
}
.error {
  margin-bottom: 0;
  color: var(--s-danger);
}
</style>
