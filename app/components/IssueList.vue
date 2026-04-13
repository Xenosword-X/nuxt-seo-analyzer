<!-- app/components/IssueList.vue -->
<template>
  <ul v-if="issues.length > 0" class="mt-2 space-y-1">
    <li
      v-for="issue in issues"
      :key="issue"
      class="flex items-start gap-1.5 text-xs text-orange-700 bg-orange-50 px-2 py-1 rounded"
    >
      <span class="flex-shrink-0 mt-0.5">⚠️</span>
      <span>{{ issue }}</span>
    </li>
  </ul>
  <p v-else class="text-xs text-green-600 mt-1">✅ 無問題</p>
</template>

<script setup lang="ts">
defineProps<{ issues: string[] }>()
</script>
