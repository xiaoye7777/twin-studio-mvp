<script setup lang="ts">
/** 底部资源栏：内置模型和上传的模型，拖进视口就放进场景。 */
import { ElMessage } from 'element-plus'
import { Box, Upload } from 'lucide-vue-next'
import { computed, onMounted, ref } from 'vue'
import { writeAssetDrag } from '@/library/assetDrag'
import { builtinModels, builtinThumbnailUrl } from '@/library/builtinModels'
import { useAssetStore } from '@/stores/assets'

type Tab = '全部' | '写实' | '卡通' | '我的'
const tabs: Tab[] = ['全部', '写实', '卡通', '我的']
const tab = ref<Tab>('全部')
const store = useAssetStore()
const fileInput = ref<HTMLInputElement>()
const uploading = ref(false)
const builtinFiles = new Set(builtinModels.map(model => model.file))
const uploaded = computed(() => store.assets.filter(asset => !builtinFiles.has(asset.name)))
const builtins = computed(() =>
  tab.value === '我的' ? [] : builtinModels.filter(model => tab.value === '全部' || model.style === tab.value),
)

onMounted(() => void store.refresh().catch(() => {}))

async function upload(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const files = [...(input.files ?? [])]
  input.value = ''
  uploading.value = true
  tab.value = '我的'
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
</script>

<template>
  <section class="dock s-panel" data-testid="asset-dock">
    <div class="s-panel-head">
      <button v-for="item in tabs" :key="item" class="s-tab" :class="{ 'is-active': tab === item }" @click="tab = item">
        {{ item }}
      </button>
      <span class="dock__space" />
      <button class="s-btn s-btn--sm" :disabled="uploading" @click="fileInput?.click()">
        <Upload :size="12" />{{ uploading ? '上传中…' : '上传模型' }}
      </button>
      <input ref="fileInput" type="file" accept=".glb" multiple hidden @change="upload" />
    </div>
    <div class="dock__items">
      <div
        v-for="model in builtins"
        :key="model.key"
        class="item"
        draggable="true"
        :title="`拖进场景：${model.name}`"
        :data-testid="`asset-${model.key}`"
        @dragstart="writeAssetDrag($event.dataTransfer!, { type: 'builtin', modelKey: model.key })"
      >
        <img :src="builtinThumbnailUrl(model)" alt="" draggable="false" />
        <span>{{ model.name }}</span>
      </div>
      <template v-if="tab === '全部' || tab === '我的'">
        <div
          v-for="asset in uploaded"
          :key="asset.id"
          class="item"
          draggable="true"
          :title="`拖进场景：${asset.name}`"
          @dragstart="
            writeAssetDrag($event.dataTransfer!, {
              type: 'asset',
              assetId: asset.id,
              name: asset.name.replace(/\.glb$/i, ''),
            })
          "
        >
          <div class="item__blank"><Box :size="22" /></div>
          <span>{{ asset.name.replace(/\.glb$/i, '') }}</span>
        </div>
      </template>
      <p v-if="tab === '我的' && !uploaded.length" class="s-hint dock__none">
        还没有上传模型，点右上角上传 .glb 文件。
      </p>
    </div>
  </section>
</template>

<style scoped>
.dock {
  height: 148px;
  flex: none;
  border-top: 1px solid var(--s-line);
}
.dock__space {
  flex: 1;
}
.dock__items {
  display: flex;
  min-height: 0;
  flex: 1;
  gap: 8px;
  overflow-x: auto;
  padding: 8px 10px;
}
.dock__none {
  margin: 0;
}
.item {
  display: flex;
  width: 84px;
  flex: none;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid var(--s-line);
  border-radius: 6px;
  background: var(--s-panel-2);
  cursor: grab;
}
.item:hover {
  border-color: var(--s-accent);
}
.item img,
.item__blank {
  display: grid;
  width: 100%;
  min-height: 0;
  flex: 1;
  place-items: center;
  object-fit: contain;
  color: var(--s-fg-3);
}
.item span {
  overflow: hidden;
  padding: 2px 5px 3px;
  font-size: 11px;
  text-align: center;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
