import tailwindcss from '@tailwindcss/vite'

export default defineNuxtConfig({
  compatibilityDate: '2026-07-20',
  devtools: { enabled: false },
  modules: ['@pinia/nuxt', 'shadcn-nuxt'],
  css: ['~/assets/css/main.css'],
  vite: {
    plugins: [tailwindcss()],
  },
  shadcn: {
    prefix: '',
    componentDir: 'app/components/ui',
  },
  runtimeConfig: {
    // NUXT_API_TARGET_ORIGIN 환경변수로 재정의 가능
    apiTargetOrigin: 'http://220.76.251.227:9930',
    // 프록시 허용 경로 접두(화이트리스트)
    apiAllowedPrefix: '/sqiapi/addr',
  },
})
