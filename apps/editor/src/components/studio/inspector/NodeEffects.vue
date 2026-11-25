<script setup lang="ts">
import { ChevronDown, Plus, Siren, Sparkles, Trash2 } from 'lucide-vue-next'
import { computed, ref } from 'vue'
import {
  effectDefinition,
  effectDefinitions,
  type EffectInstance,
  type EffectKind,
  getBuiltinTemplates,
  type RuleCondition,
  type SceneNodeV2,
  type VisualRule,
} from '@twin-studio/core'
import UiColor from '@/components/ui/UiColor.vue'
import UiNumber from '@/components/ui/UiNumber.vue'
import UiRow from '@/components/ui/UiRow.vue'
import UiSection from '@/components/ui/UiSection.vue'
import UiSlider from '@/components/ui/UiSlider.vue'
import UiSwitch from '@/components/ui/UiSwitch.vue'
import UiText from '@/components/ui/UiText.vue'
import { useSession } from '@/studio/context'

const props = defineProps<{ nodes: SceneNodeV2[] }>()
const session = useSession()
const node = computed(() => (props.nodes.length === 1 ? props.nodes[0]! : null))
const effects = computed(() => (node.value ? session.effects.effectsFor(node.value.id) : []))
const rules = computed(() => (node.value ? session.effects.rulesFor(node.value.id) : []))
const binding = computed(() => {
  void session.doc.value
  return node.value ? session.devices.bindingFor(node.value.id) : undefined
})
const expanded = ref<string | null>(null)
const picking = ref(false)
const templates = getBuiltinTemplates()
const categories = computed(() => {
  const groups = new Map<string, typeof effectDefinitions>()
  for (const definition of effectDefinitions)
    groups.set(definition.category, [...(groups.get(definition.category) ?? []), definition])
  return [...groups]
})
const ruleStatus = computed(() => {
  void session.ui.syncRevision
  return session.twin.dataSourceStatus === 'connected'
})

function add(kind: EffectKind): void {
  const n = node.value
  if (!n) return
  session.effects.addEffect(n.id, kind)
  picking.value = false
  expanded.value = session.effects.effectsFor(n.id).at(-1)?.id ?? null
}

function set<K extends keyof EffectInstance['parameters']>(
  effect: EffectInstance,
  key: K,
  value: EffectInstance['parameters'][K],
): void {
  session.effects.updateEffect(
    effect.id,
    target => void (target.parameters[key] = value),
    `effect:${effect.id}:${String(key)}`,
  )
}

function toggleVariable(effect: EffectInstance, key: string): void {
  const current = effect.parameters.variables ?? []
  const next = current.includes(key) ? current.filter(item => item !== key) : [...current, key]
  session.effects.updateEffect(effect.id, target => void (target.parameters.variables = next.length ? next : undefined))
}

function setCondition(
  rule: VisualRule,
  patch: Partial<{ variableKey: string; operator: string; value: string }>,
): void {
  const variable = binding.value?.variables.find(item => item.key === (patch.variableKey ?? rule.variableKey))
  if (!variable) return
  const operator = patch.operator ?? rule.condition.operator
  const rawValue = patch.value ?? String(rule.condition.value)
  let condition: RuleCondition
  if (variable.dataType === 'number') {
    const value = Number(rawValue)
    condition = {
      dataType: 'number',
      operator: operator as RuleCondition['operator'],
      value: Number.isFinite(value) ? value : 0,
    }
  } else if (variable.dataType === 'boolean') {
    condition = { dataType: 'boolean', operator: operator === '!=' ? '!=' : '==', value: rawValue === 'true' }
  } else condition = { dataType: 'string', operator: operator === '!=' ? '!=' : '==', value: rawValue }
  session.effects.updateRule(rule.id, target => {
    target.variableKey = variable.key
    target.condition = condition
  })
}

function setTemplate(rule: VisualRule, templateId: string): void {
  const template = templates.find(item => item.id === templateId)
  if (template) session.effects.updateRule(rule.id, target => void (target.template = structuredClone(template)))
}

const operators = ['>', '>=', '<', '<=', '==', '!='] as const
</script>

<template>
  <div v-if="node" data-testid="node-effects">
    <UiSection title="特效" :count="effects.length">
      <template #actions>
        <button class="s-btn s-btn--sm" data-testid="add-effect" @click="picking = !picking">
          <Plus :size="12" />添加
        </button>
      </template>
      <div v-if="picking" class="picker">
        <div v-for="[category, definitions] in categories" :key="category" class="picker__group">
          <span class="picker__category">{{ category }}</span>
          <div class="picker__grid">
            <button
              v-for="definition in definitions"
              :key="definition.kind"
              class="picker__item"
              :title="definition.description"
              :data-testid="`effect-kind-${definition.kind}`"
              @click="add(definition.kind)"
            >
              <Sparkles :size="13" />{{ definition.name }}
            </button>
          </div>
        </div>
      </div>
      <div v-if="!effects.length && !picking" class="s-empty">
        <Sparkles :size="20" />
        <span>常驻特效：光框、围栏、光柱、数据标牌…</span>
      </div>
      <div v-for="effect in effects" :key="effect.id" class="fx" :class="{ 'is-open': expanded === effect.id }">
        <header class="fx__head" @click="expanded = expanded === effect.id ? null : effect.id">
          <span class="fx__swatch" :style="{ background: effect.parameters.color }" />
          <span class="fx__name">{{ effectDefinition(effect.kind).name }}</span>
          <span class="fx__desc">{{ effectDefinition(effect.kind).category }}</span>
          <button class="s-icon-btn" title="删除特效" @click.stop="session.effects.removeEffect(effect.id)">
            <Trash2 :size="12" />
          </button>
          <ChevronDown class="fx__chevron" :size="13" />
        </header>
        <div v-if="expanded === effect.id" class="fx__body">
          <template v-for="field in effectDefinition(effect.kind).fields" :key="field">
            <UiRow v-if="field === 'color'" label="颜色">
              <UiColor
                :model-value="effect.parameters.color"
                @update="set(effect, 'color', $event)"
                @commit="session.commit()"
              />
            </UiRow>
            <UiRow v-else-if="field === 'opacity'" label="不透明度">
              <UiSlider
                :model-value="effect.parameters.opacity"
                :min="0"
                :max="1"
                @update="set(effect, 'opacity', $event)"
                @commit="session.commit()"
              />
            </UiRow>
            <UiRow v-else-if="field === 'speed'" label="速度">
              <UiSlider
                :model-value="effect.parameters.speed"
                :min="0"
                :max="10"
                :step="0.1"
                @update="set(effect, 'speed', $event)"
                @commit="session.commit()"
              />
            </UiRow>
            <UiRow v-else-if="field === 'padding'" label="外扩">
              <UiNumber
                :model-value="effect.parameters.padding"
                :min="0"
                :max="100"
                unit="m"
                @update="set(effect, 'padding', $event)"
                @commit="session.commit()"
              />
            </UiRow>
            <UiRow v-else-if="field === 'height'" label="高度">
              <UiNumber
                :model-value="effect.parameters.height ?? 4"
                :min="0"
                :max="500"
                unit="m"
                @update="set(effect, 'height', $event)"
                @commit="session.commit()"
              />
            </UiRow>
            <UiRow v-else-if="field === 'scale'" label="大小">
              <UiSlider
                :model-value="effect.parameters.scale ?? 1"
                :min="0.3"
                :max="4"
                :step="0.05"
                @update="set(effect, 'scale', $event)"
                @commit="session.commit()"
              />
            </UiRow>
            <UiRow v-else-if="field === 'text'" :label="effect.kind === 'data-label' ? '标题' : '文字'">
              <UiText
                :model-value="effect.parameters.text"
                :placeholder="effect.kind === 'data-label' ? '默认为设备名称' : ''"
                @commit="session.effects.updateEffect(effect.id, target => void (target.parameters.text = $event))"
              />
            </UiRow>
            <UiRow v-else-if="field === 'variables'" label="显示变量" stack>
              <div v-if="binding" class="fx__vars">
                <label v-for="variable in binding.variables" :key="variable.key" class="fx__var">
                  <input
                    type="checkbox"
                    :checked="!effect.parameters.variables || effect.parameters.variables.includes(variable.key)"
                    @change="toggleVariable(effect, variable.key)"
                  />{{ variable.name || variable.key }}
                </label>
              </div>
              <span v-else class="s-hint">先在「数据」页签绑定设备，标牌会显示其实时数据</span>
            </UiRow>
          </template>
          <p v-if="effect.kind === 'outline'" class="fx__note s-hint">描边没有参数，颜色随主题统一。</p>
        </div>
      </div>
    </UiSection>

    <UiSection title="告警规则" :count="rules.length">
      <template #actions>
        <button
          class="s-btn s-btn--sm"
          :disabled="!binding"
          data-testid="add-rule"
          @click="session.effects.addRule(node.id)"
        >
          <Plus :size="12" />添加
        </button>
      </template>
      <p v-if="!binding" class="fx__note s-hint">告警规则由设备数据驱动：先在「数据」页签绑定设备。</p>
      <p v-else-if="!rules.length" class="fx__note s-hint">
        例如「温度 &gt; 60 时显示红色呼吸光框」。规则在预览和大屏中按实时数据生效。
      </p>
      <div v-for="rule in rules" :key="rule.id" class="rule">
        <header class="rule__head">
          <Siren :size="13" class="rule__icon" />
          <span class="rule__title">当</span>
          <UiSwitch
            class="rule__switch"
            :model-value="rule.enabled"
            @update:model-value="session.effects.updateRule(rule.id, target => void (target.enabled = $event))"
          />
          <button class="s-icon-btn" title="删除规则" @click="session.effects.removeRule(rule.id)">
            <Trash2 :size="12" />
          </button>
        </header>
        <div class="rule__condition">
          <select
            class="s-select"
            :value="rule.variableKey"
            @change="setCondition(rule, { variableKey: ($event.target as HTMLSelectElement).value })"
          >
            <option v-for="variable in binding?.variables ?? []" :key="variable.key" :value="variable.key">
              {{ variable.name || variable.key }}
            </option>
          </select>
          <select
            class="s-select"
            :value="rule.condition.operator"
            @change="setCondition(rule, { operator: ($event.target as HTMLSelectElement).value })"
          >
            <option
              v-for="operator in rule.condition.dataType === 'number' ? operators : (['==', '!='] as const)"
              :key="operator"
              :value="operator"
            >
              {{ operator }}
            </option>
          </select>
          <select
            v-if="rule.condition.dataType === 'boolean'"
            class="s-select"
            :value="String(rule.condition.value)"
            @change="setCondition(rule, { value: ($event.target as HTMLSelectElement).value })"
          >
            <option value="true">是</option>
            <option value="false">否</option>
          </select>
          <UiText
            v-else
            :model-value="String(rule.condition.value)"
            mono
            @commit="setCondition(rule, { value: $event })"
          />
        </div>
        <div class="rule__then">
          <span>显示</span>
          <select
            class="s-select"
            :value="rule.template?.id"
            @change="setTemplate(rule, ($event.target as HTMLSelectElement).value)"
          >
            <option v-for="template in templates" :key="template.id" :value="template.id">{{ template.name }}</option>
          </select>
        </div>
      </div>
      <p v-if="rules.length && !ruleStatus" class="fx__note s-hint">
        数据源未连接，规则暂不生效（场景 → 数据 中配置）。
      </p>
    </UiSection>
  </div>
  <div v-else class="s-empty">
    <Sparkles :size="20" />
    <span>选择单个对象以编辑特效</span>
  </div>
</template>

<style scoped>
.picker {
  margin: 0 8px 8px;
  padding: 8px;
  border: 1px solid var(--s-line-2);
  border-radius: 6px;
  background: var(--s-panel-2);
}
.picker__group + .picker__group {
  margin-top: 8px;
}
.picker__category {
  display: block;
  margin-bottom: 4px;
  color: var(--s-fg-3);
  font-size: 10.5px;
}
.picker__grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 4px;
}
.picker__item {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 28px;
  padding: 0 8px;
  border: 1px solid var(--s-line);
  border-radius: 4px;
  background: var(--s-field);
  font-size: 11.5px;
  text-align: left;
  cursor: pointer;
}
.picker__item:hover {
  border-color: var(--s-accent-line);
  color: var(--s-accent-2);
}
.fx {
  margin: 0 8px 4px;
  border: 1px solid var(--s-line);
  border-radius: 6px;
  background: var(--s-panel-2);
}
.fx.is-open {
  border-color: var(--s-line-2);
}
.fx__head {
  display: flex;
  height: 32px;
  align-items: center;
  gap: 8px;
  padding: 0 4px 0 10px;
  cursor: pointer;
}
.fx__swatch {
  width: 10px;
  height: 10px;
  flex-shrink: 0;
  border-radius: 3px;
  box-shadow: 0 0 8px currentColor;
}
.fx__name {
  font-weight: 500;
}
.fx__desc {
  color: var(--s-fg-3);
  font-size: 10.5px;
}
.fx__head .s-icon-btn {
  margin-left: auto;
}
.fx__chevron {
  color: var(--s-fg-3);
  transition: transform 120ms ease;
}
.fx.is-open .fx__chevron {
  transform: rotate(180deg);
}
.fx__body {
  padding: 2px 0 8px;
  border-top: 1px solid var(--s-line);
}
.fx__body :deep(.ui-row) {
  padding: 2px 10px;
}
.fx__vars {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 12px;
}
.fx__var {
  display: flex;
  align-items: center;
  gap: 4px;
  color: var(--s-fg-2);
  font-size: 11px;
}
.fx__note {
  margin: 0;
  padding: 2px 12px 8px;
}
.rule {
  margin: 0 8px 6px;
  padding: 8px;
  border: 1px solid var(--s-line);
  border-radius: 6px;
  background: var(--s-panel-2);
}
.rule__head {
  display: flex;
  align-items: center;
  gap: 6px;
}
.rule__icon {
  color: var(--s-danger);
}
.rule__title {
  color: var(--s-fg-2);
}
.rule__switch {
  margin-left: auto;
}
.rule__condition {
  display: grid;
  grid-template-columns: 1.3fr 0.7fr 1fr;
  gap: 4px;
  margin-top: 6px;
}
.rule__then {
  display: grid;
  grid-template-columns: auto 1fr;
  align-items: center;
  gap: 8px;
  margin-top: 6px;
  color: var(--s-fg-2);
}
</style>
