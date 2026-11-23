<script setup lang="ts">
/** 左栏「镜头」：调好视角后添加，每个镜头是一张缩略图卡片，点击切换过去。 */
import { ElMessage } from 'element-plus'
import { Camera, Image as ImageIcon, Pencil, RefreshCw, X } from 'lucide-vue-next'
import { computed, nextTick, ref } from 'vue'
import { useSession } from '@/studio/context'

const session = useSession()
const bookmarks = computed(() => session.doc.value.bookmarks)
const renaming = ref<string | null>(null)
const renameInputs = ref<HTMLInputElement[]>([])
const adding = ref(false)

async function add(): Promise<void> {
  if (adding.value) return
  adding.value = true
  try {
    await session.cameras.add()
  } finally {
    adding.value = false
  }
}

async function setCover(id: string): Promise<void> {
  try {
    await session.setBookmarkCover(id)
    ElMessage.success('项目卡片封面已更新')
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '封面更新失败')
  }
}

async function startRename(id: string): Promise<void> {
  renaming.value = id
  await nextTick()
  const input = renameInputs.value[0]
  input?.focus()
  input?.select()
}

function finishRename(id: string, event: Event): void {
  if (renaming.value !== id) return
  session.cameras.rename(id, (event.target as HTMLInputElement).value)
  renaming.value = null
}
</script>

<template>
  <div class="s-scroll cameras" data-testid="camera-panel">
    <button class="s-btn s-btn--block" data-testid="add-camera" :disabled="adding" @click="add">
      <Camera :size="13" />添加当前镜头
    </button>
    <p v-if="!bookmarks.length" class="s-hint">在视口里转到想要的角度，点上面的按钮存下来；点击卡片切换到那个镜头。</p>
    <div class="cameras__grid">
      <div
        v-for="bookmark in bookmarks"
        :key="bookmark.id"
        class="camera"
        :title="`切换到 ${bookmark.name}`"
        :data-testid="`camera-${bookmark.name}`"
        @click="session.cameras.flyTo(bookmark.id)"
      >
        <button
          type="button"
          class="camera__view"
          :aria-label="`切换到 ${bookmark.name}`"
          @click.stop="session.cameras.flyTo(bookmark.id)"
        >
          <img v-if="bookmark.thumbnail" class="camera__image" :src="bookmark.thumbnail" alt="" />
          <span v-else class="camera__image camera__image--blank" />
        </button>
        <div class="camera__name" @click.stop>
          <input
            v-if="renaming === bookmark.id"
            ref="renameInputs"
            class="camera__rename s-input"
            aria-label="镜头名称"
            :value="bookmark.name"
            @blur="finishRename(bookmark.id, $event)"
            @keydown.enter.stop="!$event.isComposing && ($event.target as HTMLInputElement).blur()"
            @keydown.esc.stop="!$event.isComposing && (renaming = null)"
          />
          <button
            v-else
            type="button"
            class="camera__edit"
            title="修改镜头名称"
            :aria-label="`修改镜头名称：${bookmark.name}`"
            @click="startRename(bookmark.id)"
          >
            <span>{{ bookmark.name }}</span>
            <Pencil :size="12" aria-hidden="true" />
          </button>
        </div>
        <button
          type="button"
          class="camera__cover s-btn s-btn--sm"
          :disabled="session.ui.settingCover"
          :title="session.ui.coverBookmarkId === bookmark.id ? '用这个镜头重新拍摄项目封面' : '将这个镜头设为项目封面'"
          @click.stop="setCover(bookmark.id)"
        >
          <ImageIcon :size="12" />{{ session.ui.coverBookmarkId === bookmark.id ? '更新封面' : '设为封面' }}
        </button>
        <div class="camera__actions">
          <button class="s-icon-btn" title="用当前镜头更新" @click.stop="session.cameras.update(bookmark.id)">
            <RefreshCw :size="11" />
          </button>
          <button class="s-icon-btn" title="删除镜头" @click.stop="session.cameras.remove(bookmark.id)">
            <X :size="11" />
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.cameras {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 10px;
  padding: 10px;
}
.cameras .s-hint {
  margin: 0;
}
.cameras__grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}
.camera {
  position: relative;
  overflow: hidden;
  border: 1px solid var(--s-line);
  border-radius: 6px;
  background: var(--s-panel-2);
  cursor: pointer;
}
.camera:hover {
  border-color: var(--s-accent);
}
.camera__view {
  display: block;
  width: 100%;
  border: 0;
  padding: 0;
  background: transparent;
  cursor: pointer;
}
.camera__cover {
  margin: 0 5px 5px;
}
.camera__image {
  display: block;
  width: 100%;
  aspect-ratio: 16 / 10;
  object-fit: cover;
}
.camera__image--blank {
  background: var(--s-panel);
}
.camera__name {
  padding: 3px 6px;
  font-size: 11.5px;
}
.camera__edit {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 4px;
  width: 100%;
  min-height: 20px;
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  cursor: pointer;
}
.camera__edit span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.camera__edit svg {
  flex: none;
}
.camera__edit:hover {
  color: var(--s-accent);
}
.camera__rename {
  width: 100%;
  height: 18px;
}
.camera__actions {
  position: absolute;
  top: 3px;
  right: 3px;
  display: none;
  gap: 2px;
}
.camera:hover .camera__actions,
.camera:focus-within .camera__actions {
  display: flex;
}
.camera__actions .s-icon-btn {
  width: 20px;
  height: 20px;
  background: rgba(0, 0, 0, 0.55);
  color: #fff;
}
</style>
