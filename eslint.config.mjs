// @nuxt/eslint 모듈이 생성하는 프로젝트 인지형 flat config (`nuxt prepare` 후 사용 가능)
import withNuxt from './.nuxt/eslint.config.mjs'

export default withNuxt(
  {
    ignores: ['app/components/ui/**', 'app/data/**'],
  },
  {
    rules: {
      // Prettier가 void 요소를 자기닫힘(<input />)으로 포맷하므로 이에 맞춘다
      'vue/html-self-closing': ['warn', { html: { void: 'always' } }],
    },
  },
)
