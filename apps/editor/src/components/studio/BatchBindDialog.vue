<script setup lang="ts">
/** 批量绑定设备：给选中的对象各绑一台设备，编号自动递增。 */
import { ElMessage } from 'element-plus'
import { computed, reactive, watch } from 'vue'
import UiNumber from '@/components/ui/UiNumber.vue'
import { useSession } from '@/studio/context'
import { deviceIdFor, deviceTemplates } from '@/studio/deviceTemplates'
import { useShell } from '@/studio/shell'

const session = useSession()
const shell = useShell()
const visible = computed({
  get: () => shell.dialog === 'batch-bind',
  set: value => {
    if (!value) shell.dialog = null
  },
})
const bind = reactive({
  templateId: deviceTemplates[0]!.id,
  prefix: deviceTemplates[0]!.prefix,
  start: 1,
  name: deviceTemplates[0]!.name,
})
watch(
  () => bind.templateId,
  id => {
    const template = deviceTemplates.find(item => item.id === id)
    if (!template) return
    bind.prefix = template.prefix
    bind.name = template.name
  },
)
const preview = computed(() => {
  const count = session.selection.value.length
  if (!count) return ''
  const first = deviceIdFor(bind.prefix, bind.start)
  return count === 1 ? first : `${first} … ${deviceIdFor(bind.prefix, bind.start + count - 1)}`
})

function run(): void {
  const template = deviceTemplates.find(item => item.id === bind.templateId)
  if (!template || !bind.prefix.trim()) return
  // 按场景树里的顺序编号，编号就和布局一致。
  const order = new Map(session.doc.value.nodes.map((node, index) => [node.id, index]))
  const ids = [...session.selection.value].sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0))
  const count = session.devices.batchBind(
    ids,
    template,
    bind.prefix.trim(),
    bind.start,
    bind.name.trim() || template.name,
  )
  ElMessage.success(`已绑定 ${count} 台${template.name}`)
  shell.dialog = null
}
</script>

<template>
  <el-dialog v-model="visible" title="批量绑定设备" width="440px" append-to-body class="studio-dialog">
    <div class="form">
      <label>设备类型</label>
      <select v-model="bind.templateId" class="s-select" data-testid="batch-template">
        <option v-for="template in deviceTemplates" :key="template.id" :value="template.id">{{ template.name }}</option>
      </select>
      <label>编号前缀</label>
      <input v-model="bind.prefix" class="s-input s-mono" data-testid="batch-prefix" />
      <label>起始编号</label>
      <UiNumber :model-value="bind.start" :min="0" :max="9999" :step="1" :precision="0" @update="bind.start = $event" />
      <label>名称前缀</label>
      <input v-model="bind.name" class="s-input" />
    </div>
    <p class="preview">
      将为 {{ session.selection.value.length }} 个对象绑定设备：<b class="s-mono">{{ preview }}</b>
    </p>
    <template #footer>
      <button class="s-btn" @click="shell.dialog = null">取消</button>
      <button class="s-btn s-btn--primary" data-testid="dialog-confirm" @click="run">确定</button>
    </template>
  </el-dialog>
</template>

<style scoped>
.form {
  display: grid;
  grid-template-columns: 80px 1fr;
  align-items: center;
  gap: 10px 12px;
}
.form label {
  color: var(--s-fg-2);
  font-size: 12px;
}
.preview {
  margin: 14px 0 0;
  color: var(--s-fg-2);
  font-size: 12px;
  line-height: 1.6;
}
</style>
