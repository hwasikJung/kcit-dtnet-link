<script setup lang="ts">
import type { Map as LeafletMap } from 'leaflet'

// 키 카드의 위치 미니 지도 — Leaflet(gzip 약 42KB)은 지도가 펼쳐질 때만 동적 로드한다.
// 타일은 OpenStreetMap 공용 서버(HTTPS 외부 리소스)라 인터넷이 없으면 실패 → 폴백 링크 표시.
const props = defineProps<{
  lat: number
  lng: number
  /** 외부 지도 링크에 넣을 장소 표기(주소) */
  label?: string
}>()

const el = ref<HTMLElement | null>(null)
const failed = ref(false)
let map: LeafletMap | null = null

const kakaoUrl = computed(
  () =>
    `https://map.kakao.com/link/map/${encodeURIComponent(props.label || '위치')},${props.lat},${props.lng}`,
)

onMounted(async () => {
  try {
    const [{ default: L }] = await Promise.all([
      import('leaflet'),
      // @ts-expect-error CSS 모듈 — Vite가 스타일시트로 주입한다
      import('leaflet/dist/leaflet.css'),
    ])
    if (!el.value) return
    map = L.map(el.value, { scrollWheelZoom: false }).setView([props.lat, props.lng], 17)
    const tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    })
    tiles.on('tileerror', () => {
      failed.value = true
    })
    tiles.addTo(map)
    // 기본 마커 아이콘은 이미지 에셋 경로 문제가 있어 원형 마커(포인트 컬러)로 대체
    L.circleMarker([props.lat, props.lng], {
      radius: 9,
      color: '#b85c00',
      weight: 2.5,
      fillColor: '#b85c00',
      fillOpacity: 0.35,
    }).addTo(map)
  } catch {
    failed.value = true
  }
})

onBeforeUnmount(() => {
  map?.remove()
  map = null
})
</script>

<template>
  <!-- isolate: Leaflet 내부 z-index(컨트롤 1000 등)가 카드 밖(모달 오버레이 z-50)을 뚫지 않게 격리 -->
  <div class="relative isolate z-0 h-60 overflow-hidden rounded-lg border">
    <div ref="el" class="h-full w-full" />
    <div
      v-if="failed"
      class="absolute inset-0 z-[500] flex flex-col items-center justify-center gap-1.5 bg-muted/95 p-4 text-center text-xs text-muted-foreground"
    >
      <p>지도를 불러오지 못했습니다. 인터넷 연결이 필요합니다.</p>
      <a
        :href="kakaoUrl"
        target="_blank"
        rel="noopener noreferrer"
        class="font-medium text-primary underline underline-offset-2"
      >
        카카오맵에서 위치 열기
      </a>
    </div>
  </div>
</template>
