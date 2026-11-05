<script setup lang="ts">
import { ChevronRight } from 'lucide-vue-next'
import { ref } from 'vue'

const props = withDefaults(
  /** nested：放在另一个折叠区里的小标题。 */
  defineProps<{ title: string; collapsible?: boolean; open?: boolean; count?: number | null; nested?: boolean }>(),
  {
    collapsible: true,
    open: true,
    count: null,
    nested: false,
  },
)
const expanded = ref(props.open)
</script>

<template>
  <section class="ui-section" :class="{ 'is-open': expanded, 'is-nested': nested }">
    <header class="ui-section__head" @click="collapsible && (expanded = !expanded)">
      <ChevronRight v-if="collapsible" class="ui-section__chevron" :size="13" />
      <span class="ui-section__title">{{ title }}</span>
      <span v-if="count !== null" class="ui-section__count">{{ count }}</span>
      <span class="ui-section__actions" @click.stop><slot name="actions" /></span>
    </header>
    <div v-show="expanded" class="ui-section__body"><slot /></div>
  </section>
</template>

<style scoped>
.ui-section {
  border-bottom: 1px solid var(--s-line);
}
.ui-section__head {
  display: flex;
  height: 32px;
  align-items: center;
  gap: 4px;
  padding: 0 8px 0 8px;
  cursor: pointer;
}
.ui-section__chevron {
  color: var(--s-fg-3);
  transition: transform 140ms ease;
}
.ui-section.is-open .ui-section__chevron {
  transform: rotate(90deg);
}
.ui-section__title {
  color: var(--s-fg);
  font-size: 11.5px;
  font-weight: 600;
  letter-spacing: 0.02em;
}
.ui-section__count {
  min-width: 16px;
  padding: 0 5px;
  border-radius: 8px;
  background: var(--s-raised);
  color: var(--s-fg-3);
  font-size: 10px;
  line-height: 16px;
  text-align: center;
}
.ui-section__actions {
  display: flex;
  margin-left: auto;
  gap: 2px;
}
.ui-section__body {
  padding: 0 0 10px;
}
.ui-section.is-nested {
  border-bottom: 0;
  border-top: 1px solid var(--s-line);
}
.ui-section.is-nested .ui-section__head {
  height: 28px;
}
.ui-section.is-nested .ui-section__title {
  color: var(--s-fg-2);
  font-weight: 500;
}
.ui-section.is-nested .ui-section__body {
  padding-bottom: 6px;
}
</style>
