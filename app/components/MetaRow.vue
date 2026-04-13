<!-- app/components/MetaRow.vue -->
<template>
  <div class="flex gap-2">
    <span class="text-gray-500 flex-shrink-0 w-24">{{ label }}：</span>
    <span v-if="value" class="text-gray-800 break-all">{{ value }}</span>
    <span v-else class="text-red-400">（未設定）</span>
  </div>
</template>

<script setup lang="ts">
defineProps<{ label: string; value?: string | null }>()
</script>
