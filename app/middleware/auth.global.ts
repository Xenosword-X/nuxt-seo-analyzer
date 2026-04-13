// middleware/auth.global.ts
export default defineNuxtRouteMiddleware((to) => {
  const user = useSupabaseUser()
  // 登入頁與 OAuth 回呼頁不需要驗證
  if (to.path === '/' || to.path === '/confirm') return
  // 未登入則跳轉到登入頁
  if (!user.value) return navigateTo('/')
})
