<script setup lang="ts">
import { Boxes, Box } from 'lucide-vue-next'
import { useRoute } from 'vue-router'
import '@/studio/studio.css'

const route = useRoute()
const nav = [
  { to: '/scenes', label: '3D场景', icon: Box },
  { to: '/assets', label: '资源库', icon: Boxes },
]
</script>

<template>
  <div class="studio-home home">
    <aside class="home__nav">
      <div class="home__brand">
        <span class="home__mark">T</span>
        <strong>Twin Studio</strong>
      </div>
      <RouterLink
        v-for="item in nav"
        :key="item.to"
        :to="item.to"
        class="home__link"
        :class="{ 'is-active': route.path.startsWith(item.to) }"
      >
        <component :is="item.icon" :size="16" />{{ item.label }}
      </RouterLink>
    </aside>
    <main class="home__main">
      <RouterView />
    </main>
  </div>
</template>

<style scoped>
.home {
  display: grid;
  min-height: 100vh;
  grid-template-columns: 200px minmax(0, 1fr);
  background: var(--s-wash-page), var(--s-bg);
  color: var(--s-fg);
  font: 13px/1.5 var(--s-font);
}
.home__nav {
  position: sticky;
  top: 0;
  display: flex;
  height: 100vh;
  flex-direction: column;
  gap: 2px;
  padding: 16px 12px;
  border-right: 1px solid var(--s-line);
  background: var(--s-wash), var(--s-panel);
}
.home__brand {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 4px 6px 20px;
  font-size: 14px;
}
.home__mark {
  display: grid;
  width: 28px;
  height: 28px;
  place-items: center;
  border-radius: 7px;
  background: linear-gradient(135deg, var(--s-accent-2), var(--s-accent));
  color: var(--s-on-accent);
  font-weight: 800;
}
.home__link {
  display: flex;
  height: 34px;
  align-items: center;
  gap: 10px;
  padding: 0 10px;
  border-radius: 6px;
  color: var(--s-fg-2);
  text-decoration: none;
}
.home__link:hover {
  background: var(--s-hover);
  color: var(--s-fg);
}
.home__link.is-active {
  background: var(--s-accent-soft);
  color: var(--s-accent-2);
}
.home__main {
  min-width: 0;
  padding: 28px 36px 48px;
}
</style>
