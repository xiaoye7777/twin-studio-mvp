<script setup lang="ts">
import ModelLibrary from '@/components/library/ModelLibrary.vue'
import { useSession } from '@/studio/context'

const session = useSession()
function inScene(id: string): boolean {
  return session.doc.value.nodes.some(node => node.kind === 'model' && node.model.assetId === id)
}
</script>
<template><ModelLibrary compact :in-scene="inScene" /></template>
