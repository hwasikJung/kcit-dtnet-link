import tailwindcss from '@tailwindcss/vite'

export default defineNuxtConfig({
  compatibilityDate: '2026-07-20',
  devtools: { enabled: false },
  modules: ['@nuxt/eslint', '@pinia/nuxt', 'shadcn-nuxt'],
  css: ['~/assets/css/main.css'],
  vite: {
    plugins: [tailwindcss()],
  },
  shadcn: {
    prefix: '',
    componentDir: 'app/components/ui',
  },
  runtimeConfig: {
    public: {
      // 브라우저가 직접 호출하는 API 서버 오리진 (CORS 전면 허용 확인됨)
      // 빌드(generate) 시 NUXT_PUBLIC_API_BASE 환경변수로 재정의 가능
      apiBase: 'http://220.76.251.227:9930',
    },
  },
})
