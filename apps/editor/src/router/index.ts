import { createRouter, createWebHistory } from 'vue-router'
import AppLayout from '@/components/layout/AppLayout.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      component: AppLayout,
      children: [
        { path: '', redirect: '/scenes' },
        {
          path: 'scenes',
          name: 'scenes',
          component: () => import('@/views/SceneList.vue'),
          meta: { title: '3D场景' },
        },
        {
          path: 'assets',
          name: 'assets',
          component: () => import('@/views/AssetLibrary.vue'),
          meta: { title: '资源库' },
        },
      ],
    },
    {
      path: '/editor/:projectId',
      name: 'editor',
      component: () => import('@/views/SceneEditor.vue'),
      meta: { title: '场景编辑器' },
    },
    { path: '/:pathMatch(.*)*', redirect: '/scenes' },
  ],
})

router.afterEach(to => {
  document.title = `${String(to.meta.title ?? '')} · Twin Studio`
})

export default router
