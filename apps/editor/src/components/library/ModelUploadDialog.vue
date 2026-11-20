<script setup lang="ts">
import { ElMessage } from 'element-plus'
import { Box, FilePlus2, X } from 'lucide-vue-next'
import { computed, onBeforeUnmount, reactive, ref } from 'vue'
import { useAssetStore } from '@/stores/assets'

interface Entry {
  id: number
  file: File
  title: string
  pending: boolean
  invalid: boolean
  message: string
  thumbnail: Blob | null
  preview: string
}

const emit = defineEmits<{ close: [] }>()
const store = useAssetStore()
const input = ref<HTMLInputElement>()
const entries = ref<Entry[]>([])
const busy = ref(false)
const error = ref('')
let nextId = 0
let mounted = true
const ready = computed(
  () => entries.value.length && entries.value.every(e => !e.pending && !e.invalid && e.title.trim()),
)

function remove(row: Entry): void {
  if (row.preview) URL.revokeObjectURL(row.preview)
  entries.value = entries.value.filter(item => item.id !== row.id)
}

onBeforeUnmount(() => {
  mounted = false
  for (const entry of entries.value) if (entry.preview) URL.revokeObjectURL(entry.preview)
})

async function prepare(row: Entry): Promise<void> {
  const exists = () => mounted && entries.value.some(e => e.id === row.id)
  try {
    if (!/\.glb$/i.test(row.file.name)) throw new Error('请选择 .glb 模型文件')
    if (row.file.size > 128 * 1024 ** 2) throw new Error('模型不能超过 128 MiB')
    const bytes = new DataView(await row.file.slice(0, 12).arrayBuffer())
    if (
      bytes.byteLength !== 12 ||
      bytes.getUint32(0, true) !== 0x46546c67 ||
      bytes.getUint32(4, true) !== 2 ||
      bytes.getUint32(8, true) !== row.file.size
    )
      throw new Error('文件不是有效的 GLB 2.0 模型')
    const { modelThumbnail } = await import('@/library/modelThumbnail')
    const thumbnail = await modelThumbnail(async () => (exists() ? row.file : null)).catch(() => null)
    if (!exists()) return
    row.thumbnail = thumbnail
    if (thumbnail) row.preview = URL.createObjectURL(thumbnail)
    else row.message = '无法生成预览，可继续上传'
  } catch (cause) {
    row.invalid = true
    row.message = cause instanceof Error ? cause.message : '文件读取失败'
  } finally {
    row.pending = false
  }
}

function select(event: Event): void {
  const field = event.target as HTMLInputElement
  for (const file of field.files ?? []) {
    const row = reactive<Entry>({
      id: nextId++,
      file,
      title: file.name.replace(/\.glb$/i, '').slice(0, 100),
      pending: true,
      invalid: false,
      message: '',
      thumbnail: null,
      preview: '',
    })
    entries.value.push(row)
    void prepare(row)
  }
  field.value = ''
  error.value = ''
}

async function upload(): Promise<void> {
  if (!ready.value || busy.value) return
  busy.value = true
  error.value = ''
  try {
    for (const row of [...entries.value]) {
      const result = await store.upload(row.file, row.title.trim(), row.thumbnail)
      if (!result.isNew) ElMessage.info(`相同模型已存在：${result.asset.title}`)
      remove(row)
    }
    emit('close')
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '上传失败，请重试'
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <el-dialog
    :model-value="true"
    title="上传模型"
    width="min(500px, 94vw)"
    append-to-body
    class="studio-dialog"
    :show-close="!busy"
    :close-on-press-escape="!busy"
    :close-on-click-modal="!busy"
    @close="emit('close')"
  >
    <button type="button" class="s-btn" :disabled="busy" @click="input?.click()">
      <FilePlus2 :size="14" />选择 GLB 文件
    </button>
    <span class="s-hint limit">单个文件最大 128 MiB</span>
    <input ref="input" type="file" accept=".glb" multiple hidden data-testid="upload-input" @change="select" />
    <div class="files">
      <div v-for="row in entries" :key="row.id" class="file">
        <div class="preview"><img v-if="row.preview" :src="row.preview" alt="模型预览" /><Box v-else :size="24" /></div>
        <div class="details">
          <small :title="row.file.name">{{ row.file.name }}</small>
          <label>标题<input v-model="row.title" class="s-input" maxlength="100" :disabled="busy" /></label>
          <span v-if="row.pending || row.message" :class="row.invalid ? 'error' : 's-hint'">{{
            row.pending ? '正在生成缩略图…' : row.message
          }}</span>
        </div>
        <button class="s-icon-btn" title="移除文件" :disabled="busy" @click="remove(row)"><X :size="14" /></button>
      </div>
    </div>
    <p v-if="error" class="error" role="alert">{{ error }}</p>
    <template #footer>
      <button class="s-btn" :disabled="busy" @click="emit('close')">取消</button>
      <button class="s-btn s-btn--primary" :disabled="!ready || busy" @click="upload">
        {{ busy ? '上传中…' : '确认上传' }}
      </button>
    </template>
  </el-dialog>
</template>

<style scoped>
.limit {
  margin-left: 8px;
}
.files {
  max-height: 48vh;
  overflow: auto;
}
.file {
  display: flex;
  align-items: center;
  gap: 10px;
  border-top: 1px solid var(--s-line);
  margin-top: 12px;
  padding-top: 12px;
}
.preview {
  flex: none;
  width: 76px;
  aspect-ratio: 1.4;
  display: grid;
  place-items: center;
  background: var(--s-panel-2);
  color: var(--s-fg-3);
  border-radius: 6px;
}
.preview img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}
.details {
  min-width: 0;
  flex: 1;
}
.details small {
  display: block;
  color: var(--s-fg-3);
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.details label {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 4px 0;
  white-space: nowrap;
}
.error {
  color: var(--s-danger);
}
</style>
