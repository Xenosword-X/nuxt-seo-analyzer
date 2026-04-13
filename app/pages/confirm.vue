<!-- pages/confirm.vue -->
<template>
  <div class="min-h-screen flex items-center justify-center">
    <p class="text-gray-500">登入中，請稍候...</p>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: false })

const user = useSupabaseUser()

watchEffect(() => {
  if (user.value) navigateTo('/dashboard')
})
</script>
