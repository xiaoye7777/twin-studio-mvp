<script setup lang="ts">
import { Pencil, Plus, Trash2 } from 'lucide-vue-next'
import { ref } from 'vue'
import { newId, type DeviceTemplate } from '@twin-studio/core'
import { confirmAction } from '@/components/ui/confirm'
import { useSession } from '@/studio/context'
import { useShell } from '@/studio/shell'

const devices = useSession().devices
const shell = useShell()
const draft = ref<DeviceTemplate | null>(null)
const error = ref('')

function edit(type?: DeviceTemplate): void {
  error.value = ''
  draft.value = type
    ? { ...type, variables: type.variables.map(variable => ({ ...variable })) }
    : { id: newId('device-type'), name: '', type: '', prefix: 'DEV-', variables: [] }
}

function save(): void {
  if (!draft.value) return
  try {
    devices.saveTemplate({ ...draft.value, type: draft.value.type.trim() || draft.value.name.trim() })
    draft.value = null
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '无法保存设备类型'
  }
}

async function remove(type: DeviceTemplate): Promise<void> {
  if (
    await confirmAction(`从当前场景的类型列表删除「${type.name}」？已绑定的设备会保留原有类型和变量。`, {
      title: '删除设备类型',
      confirm: '删除',
      danger: true,
    })
  )
    devices.removeTemplate(type.id)
}
</script>

<template>
  <el-dialog
    v-model="shell.managingDeviceTypes"
    title="管理设备类型"
    width="min(580px, 92vw)"
    append-to-body
    class="studio-dialog"
    :close-on-click-modal="false"
  >
    <template v-if="!draft">
      <div class="toolbar">
        <span class="s-hint">当前场景 · {{ devices.templates.length }} 个类型</span>
        <button class="s-btn s-btn--primary" @click="edit()"><Plus :size="13" />添加设备类型</button>
      </div>
      <div class="types">
        <div v-for="type in devices.templates" :key="type.id" class="type-row">
          <div>
            <strong>{{ type.name }}</strong
            ><small>{{ type.type }} · {{ type.prefix }} · {{ type.variables.length }} 个变量</small>
          </div>
          <button class="s-icon-btn" :aria-label="`编辑${type.name}`" title="编辑类型" @click="edit(type)">
            <Pencil :size="14" />
          </button>
          <button class="s-icon-btn" :aria-label="`删除${type.name}`" title="删除类型" @click="remove(type)">
            <Trash2 :size="14" />
          </button>
        </div>
        <p v-if="!devices.templates.length" class="s-empty">暂无设备类型</p>
      </div>
    </template>
    <form v-else id="device-type-form" @submit.prevent="save">
      <label>类型名称<input v-model="draft.name" class="s-input" placeholder="例如：水泵" required /></label>
      <div class="pair">
        <label>类型标识<input v-model="draft.type" class="s-input" placeholder="留空使用类型名称" /></label>
        <label>编号前缀<input v-model="draft.prefix" class="s-input" placeholder="例如：PUMP-" required /></label>
      </div>
      <div class="toolbar">
        <strong>默认变量</strong>
        <button
          type="button"
          class="s-btn s-btn--sm"
          :disabled="draft.variables.length >= 50"
          @click="draft.variables.push({ key: '', name: '', dataType: 'number' })"
        >
          <Plus :size="12" />添加变量
        </button>
      </div>
      <div class="variables">
        <div v-for="(variable, index) in draft.variables" :key="index" class="variable-row">
          <input
            v-model="variable.key"
            class="s-input"
            aria-label="变量键"
            placeholder="变量键"
            maxlength="200"
            required
          />
          <input
            v-model="variable.name"
            class="s-input"
            aria-label="变量名称"
            placeholder="变量名称"
            maxlength="80"
            required
          />
          <select v-model="variable.dataType" class="s-select" aria-label="变量类型">
            <option value="number">数值</option>
            <option value="boolean">布尔</option>
            <option value="string">文本</option>
          </select>
          <input v-model="variable.unit" class="s-input" aria-label="变量单位" placeholder="单位" maxlength="20" />
          <button type="button" class="s-icon-btn" title="删除变量" @click="draft.variables.splice(index, 1)">
            <Trash2 :size="13" />
          </button>
        </div>
      </div>
      <p v-if="error" class="error" role="alert">{{ error }}</p>
    </form>
    <template #footer>
      <template v-if="draft">
        <button class="s-btn" @click="draft = null">取消</button>
        <button type="submit" form="device-type-form" class="s-btn s-btn--primary">保存类型</button>
      </template>
      <button v-else class="s-btn" @click="shell.managingDeviceTypes = false">完成</button>
    </template>
  </el-dialog>
</template>

<style scoped>
.toolbar,
.type-row {
  display: flex;
  align-items: center;
  gap: 6px;
}
.toolbar {
  justify-content: space-between;
  margin-bottom: 10px;
}
.types,
.variables {
  max-height: 44vh;
  overflow-y: auto;
}
.type-row {
  padding: 6px 0;
  border-bottom: 1px solid var(--s-line);
}
.type-row > div {
  flex: 1;
  min-width: 0;
  overflow-wrap: anywhere;
}
.type-row small {
  display: block;
  color: var(--s-fg-2);
}
label {
  display: grid;
  gap: 4px;
}
.pair,
.variable-row {
  display: grid;
  gap: 6px;
}
.pair {
  grid-template-columns: 1fr 1fr;
  margin: 10px 0 18px;
}
.variable-row {
  grid-template-columns: 1.2fr 1.2fr 0.85fr 0.65fr auto;
  margin-bottom: 5px;
}
.error {
  color: var(--s-danger);
}
</style>
