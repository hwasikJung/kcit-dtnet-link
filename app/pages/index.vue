<script setup lang="ts">
import { Badge } from '@/components/ui/badge'
import { Button, buttonVariants } from '@/components/ui/button'
import {
  Dialog,
  DialogDescription,
  DialogHeader,
  DialogScrollContent,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import {
  detectPkKind,
  extractAddrSuggestions,
  extractCoord,
  extractDongInfo,
  extractRegionCandidates,
  isRegionListTruncated,
  parseConvertResponse,
  parseKeygenResponse,
  splitPks,
  type AddrSuggestion,
  type ConvertResult,
  type DongInfo,
  type KeygenParse,
  type RegionCandidate,
} from '~/lib/keygen'
import { GRADE_DISCLAIMER, describeGrade, describeLevel } from '~/lib/match-grade'

/** 단건 생성에 사용하는 대표 기능 — 주소정제 후 건축물대장번호 매칭 (3차년도) */
const MATCH_PATH = '/sqiapi/addr/building_match_clean_union'
/** 키 카드에서 건축물대장 정보로 이어지는 기능 */
const INFO_PATH = '/sqiapi/addr/mgm_bld_pk_info/{mgmbldpk}'
/** 키 카드의 신규 PK 전환 모달에서 직접 호출하는 기능 — 기존 건축물대장 PK → 신규 PK 변환 */
const CONVERT_PATH = '/sqiapi/addr/convert_mgm_bld_pk_old_to_new'
/** 다지역 모호 감지에 사용하는 주소검색 기능(주소기반산업지원서비스) */
const JUSO_PATH = '/sqiapi/addr/asis/juso'
/** PK 직접 입력 시 신규 PK를 기존 PK로 되돌리는 기능 — 신규 PK는 대장 정보 조회가 안 된다 */
const NEW2OLD_PATH = '/sqiapi/addr/convert_mgm_bld_pk_new_to_old'
/** 위치 표시용 좌표 조회 기능 — x/y가 이미 WGS84로 변환되어 온다(2026-07-28 실측) */
const COORD_PATH = '/sqiapi/addr/legcd_n_coord'

// 지역 접두 없는 짧은 주소 — '대청로 119'는 부산 중구·하남시·보령시 3곳에 존재해 다지역 선택 카드가 뜨고,
// 나머지 둘은 후보 지역이 1곳뿐이라 바로 키가 생성된다
const SAMPLE_ADDRS = ['대청로 119', '홍은동 455', '미사대로 510', '덕풍남로 11']

const STEPS = [
  { name: '주소 정제', desc: '표준 주소로 변환' },
  { name: '건축물대장 매칭', desc: '대장 정보 대조' },
  { name: '표준연계키 생성', desc: '키 발급 완료' },
] as const
const STEP_DELAY = 450

const { toast } = useToast()
const history = useKeygenHistory()

/** 최근 생성 이력 전체 삭제 — 실수 방지를 위해 확인을 받는다 */
function clearHistory() {
  if (window.confirm('최근 생성 이력을 모두 삭제할까요?')) history.clear()
}

const addr = ref('')
/** 마지막 생성에 실제 사용한 주소 — 결과 카드의 연계 링크·요약이 입력창 수정에 흔들리지 않게 고정한다 */
const lastAddr = ref('')
const addrInput = ref<{ $el?: HTMLElement } | null>(null)
const loading = ref(false)
const stepStates = ref<('idle' | 'running' | 'done' | 'failed')[]>(['idle', 'idle', 'idle'])
const started = ref(false)
const parsed = ref<KeygenParse | null>(null)
const raw = ref<unknown>(null)
const networkError = ref('')
const elapsedMs = ref(0)
const resultSection = ref<HTMLElement | null>(null)
/** 같은 주소가 여러 시군구에 존재할 때의 지역 후보 — 비어 있지 않으면 키 카드 대신 지역 선택 카드 표시 */
const regionChoices = ref<RegionCandidate[]>([])
/** 주소검색이 1페이지(10건)만 반환해 지역 목록이 잘렸을 가능성 — 선택 카드 안내에 사용 */
const regionsTruncated = ref(false)

// ?addr=<주소> 로 진입하면 자동 생성 — 생성 시 URL에도 반영되므로 주소창 링크로 결과를 공유할 수 있다
const route = useRoute()
const router = useRouter()
onMounted(() => {
  history.refresh()
  const q = route.query.addr
  if (typeof q === 'string' && q.trim()) {
    addr.value = q.trim()
    generate()
  }
})

// 주소 대신 표준연계키(PK)를 입력한 경우 — 생성 대신 조회·전환 액션 패널을 띄운다
const pkKind = computed(() => detectPkKind(addr.value))

/** 생성 주소의 위경도(WGS84) — 키 카드의 위치 행·미니 지도에 사용, 조회 실패 시 행 자체를 숨긴다 */
const coord = ref<{ lat: number; lng: number } | null>(null)
const mapOpen = ref(false)

const success = computed(() => (parsed.value?.ok ? parsed.value.result : null))
/** 총괄표제부 PK 목록 — 서버가 콤마 구분 다건으로 줄 수 있다 */
const upperPks = computed(() => (success.value ? splitPks(success.value.upperPk) : []))
/** 총괄표제부가 여러 건 — 대표 키 하나를 정하지 않고 총괄별로 표제부를 묶어 보여준다 */
const multiUpper = computed(() => upperPks.value.length > 1)
/** 총괄표제부가 없고 표제부가 여러 건이면 대표 키를 정할 수 없다 — 목록에서 선택하게 안내 */
const noRepresentative = computed(
  () => !!success.value && !success.value.upperPk && success.value.pks.length > 1,
)
/** 대표 키 — 단일 총괄표제부 PK 우선, 없으면 단독 표제부 PK (어느 쪽이든 다건이면 빈 값) */
const mainPk = computed(() => {
  const r = success.value
  if (!r || multiUpper.value) return ''
  return upperPks.value[0] || (r.pks.length === 1 ? r.pks[0]! : '')
})
const mainPkLabel = computed(() => (success.value?.upperPk ? '총괄표제부 PK' : '표제부 PK'))
/** 매칭 등급의 잠정 한글 설명 — 알 수 없는 등급이면 null(코드만 표기) */
const gradeInfo = computed(() => (success.value ? describeGrade(success.value.grade) : null))
/** 표제부 PK 전체 목록 — 총괄 PK가 있거나 2건 이상일 때만 별도 목록으로 노출 */
const pkList = computed(() => {
  const r = success.value
  if (!r) return []
  return r.upperPk || r.pks.length > 1 ? r.pks : []
})

// 표제부 PK별 동 정보(동 이름·주/부속 구분·소속 총괄) — 건당 추가 호출이 필요해 생성 완료 직후 백그라운드로 조회한다
const dongInfos = ref<Record<string, DongInfo>>({})
const dongLoading = ref(false)
const dongLoaded = ref(false)
/** 그룹(총괄)별 부속건축물 목록 펼침 상태 — key는 pkGroups의 key */
const subOpen = ref<Record<string, boolean>>({})
/** 총괄 그룹 본문 펼침 상태 — 총괄 다건이면 세로가 길어져 기본 접힘으로 둔다 */
const groupOpen = ref<Record<string, boolean>>({})
// 재생성 시 진행 중이던 이전 조회를 무효화하는 실행 토큰
let dongRunId = 0

async function loadDongInfos() {
  // 총괄이 여러 건이면 총괄 PK도 함께 조회 — 그룹 헤더의 건물명 표기에 사용
  const pks = multiUpper.value ? [...upperPks.value, ...pkList.value] : pkList.value
  if (!pks.length) return
  const run = ++dongRunId
  dongLoading.value = true
  const apiBase = useRuntimeConfig().public.apiBase
  const queue = [...pks]
  await Promise.all(
    Array.from({ length: Math.min(5, queue.length) }, async () => {
      for (let pk = queue.shift(); pk != null && run === dongRunId; pk = queue.shift()) {
        try {
          const raw = await $fetch(
            apiBase + '/sqiapi/addr/mgm_bld_pk_info/' + encodeURIComponent(pk),
          )
          if (run !== dongRunId) return
          const info = extractDongInfo(raw)
          dongInfos.value[pk] = { ...info, label: info.label || '-' }
        } catch {
          if (run !== dongRunId) return
          dongInfos.value[pk] = { label: '-', isSub: false, purps: '', upperPk: '' }
        }
      }
    }),
  )
  if (run !== dongRunId) return
  dongLoading.value = false
  dongLoaded.value = true
}

/** 표제부 표시 그룹 — 총괄이 여러 건이면 총괄별로 묶고, 아니면(또는 소속 로드 전이면) 단일 그룹 */
interface PkGroup {
  key: string
  /** 그룹 헤더로 보여줄 총괄표제부 PK — 단일 그룹이면 빈 문자열 */
  upperPk: string
  pks: string[]
}
const pkGroups = computed<PkGroup[]>(() => {
  const uppers = upperPks.value
  if (uppers.length <= 1) {
    return pkList.value.length ? [{ key: 'all', upperPk: '', pks: pkList.value }] : []
  }
  // 총괄 다건 — 총괄 헤더는 즉시 보여주고, 소속(건별 조회 loadDongInfos)이 로드되기 전에는
  // 표제부 전체를 미분류(etc) 그룹에 둔다
  const groups: PkGroup[] = uppers.map((u) => ({ key: u, upperPk: u, pks: [] }))
  const etc: PkGroup = { key: 'etc', upperPk: '', pks: [] }
  for (const pk of pkList.value) {
    const parent = dongLoaded.value ? dongInfos.value[pk]?.upperPk : undefined
    ;(groups.find((g) => g.upperPk === parent) ?? etc).pks.push(pk)
  }
  if (etc.pks.length) groups.push(etc)
  return groups
})

/** 그룹 내 주건축물/부속건축물 분리 — 로드 전이면 전체를 주건축물로 취급 */
const groupMainPks = (g: PkGroup) =>
  dongLoaded.value ? g.pks.filter((pk) => !dongInfos.value[pk]?.isSub) : g.pks
const groupSubPks = (g: PkGroup) =>
  dongLoaded.value ? g.pks.filter((pk) => dongInfos.value[pk]?.isSub) : []

/** PK 옆 보조 표기 — "동 이름 · 주용도" (로드 전이면 빈 문자열) */
function dongText(pk: string): string {
  const info = dongInfos.value[pk]
  if (!info) return ''
  return info.purps ? `${info.label} · ${info.purps}` : info.label
}

function fillSample(v: string) {
  addr.value = v
  addrInput.value?.$el?.querySelector?.('input')?.focus()
}

// 주소 자동완성 — 사용자가 타이핑할 때만(@input) 주소검색(asis/juso)을 디바운스 호출해 후보를 띄운다.
// 프로그램적 입력(예시 채우기·이력 복원·지역 선택)은 input 이벤트가 없어 후보가 뜨지 않는다
const suggestions = ref<AddrSuggestion[]>([])
const suggestOpen = ref(false)
/** 키보드(↑↓)로 강조된 후보 인덱스 — -1이면 없음 */
const suggestActive = ref(-1)
let suggestTimer: ReturnType<typeof setTimeout> | undefined
// 입력이 이어지면 이전 호출 결과를 무시하는 실행 토큰
let suggestRunId = 0

// 디바운스 대기 중 페이지를 벗어나면 예약된 자동완성 호출을 취소한다
onBeforeUnmount(() => clearTimeout(suggestTimer))

function closeSuggest() {
  clearTimeout(suggestTimer)
  suggestRunId++
  suggestOpen.value = false
  suggestActive.value = -1
}

function onAddrInput(e: Event) {
  const q = (e.target as HTMLInputElement).value.trim()
  clearTimeout(suggestTimer)
  // PK 형식 입력이면 주소 자동완성은 무의미 — 검색하지 않는다
  if (q.length < 2 || detectPkKind(q)) {
    closeSuggest()
    return
  }
  suggestTimer = setTimeout(async () => {
    const run = ++suggestRunId
    try {
      const data = await $fetch(useRuntimeConfig().public.apiBase + JUSO_PATH, {
        query: { input_addr: q },
        timeout: 3000,
      })
      if (run !== suggestRunId) return
      suggestions.value = extractAddrSuggestions(data)
      suggestActive.value = -1
      suggestOpen.value = suggestions.value.length > 0
    } catch {
      // 자동완성은 부가 기능 — 검색 실패 시 조용히 닫는다
      if (run === suggestRunId) suggestOpen.value = false
    }
  }, 300)
}

function pickSuggestion(s: AddrSuggestion) {
  addr.value = s.roadAddr
  closeSuggest()
  generate()
}

/** Enter — 강조된 후보가 있으면 선택, 없으면 입력한 주소로 생성 */
function onAddrEnter() {
  const s = suggestOpen.value ? suggestions.value[suggestActive.value] : undefined
  if (s) pickSuggestion(s)
  else generate()
}

function onAddrKeydown(e: KeyboardEvent) {
  // 한글 IME 조합 중 방향키 오동작 방지
  if (e.isComposing || !suggestOpen.value || !suggestions.value.length) return
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    suggestActive.value = (suggestActive.value + 1) % suggestions.value.length
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    suggestActive.value =
      suggestActive.value <= 0 ? suggestions.value.length - 1 : suggestActive.value - 1
  } else if (e.key === 'Escape') {
    suggestOpen.value = false
  }
}

async function generate() {
  const address = addr.value.trim()
  if (!address || loading.value || pkKind.value) return

  closeSuggest()
  lastAddr.value = address
  loading.value = true
  started.value = true
  parsed.value = null
  raw.value = null
  networkError.value = ''
  stepStates.value = ['running', 'idle', 'idle']
  dongRunId++
  dongInfos.value = {}
  dongLoading.value = false
  dongLoaded.value = false
  subOpen.value = {}
  groupOpen.value = {}
  regionChoices.value = []
  regionsTruncated.value = false
  coord.value = null
  mapOpen.value = false
  router.replace({ query: { addr: address } })

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const delay = (ms: number) => new Promise((r) => setTimeout(r, reduced ? 0 : ms))

  const apiBase = useRuntimeConfig().public.apiBase
  const url = apiBase + MATCH_PATH
  const startedAt = performance.now()
  const fetchP = $fetch(url, { query: { input_addr: address } }).then(
    (data) => ({ ok: true as const, data }),
    (err: { data?: unknown; message?: string }) => ({ ok: false as const, err }),
  )
  // 다지역 모호 감지 — 주소검색 후보의 시군구가 2곳 이상이면 키를 확정하지 않는다. 실패 시 감지 생략(fail-open)
  const regionsP = $fetch(apiBase + JUSO_PATH, {
    query: { input_addr: address },
    timeout: 5000,
  }).then(
    (data) => ({
      regions: extractRegionCandidates(data),
      truncated: isRegionListTruncated(data),
    }),
    () => ({ regions: [] as RegionCandidate[], truncated: false }),
  )
  // 위치 좌표 — 실패 시 위치 표시만 생략(fail-open)
  const coordP = $fetch(apiBase + COORD_PATH, {
    query: { input_addr: address },
    timeout: 5000,
  }).then(
    (data) => extractCoord(data),
    () => null,
  )

  // 실제 호출은 1회지만 정제 → 매칭 → 생성 과정을 단계로 보여준다
  await delay(STEP_DELAY)
  stepStates.value = ['done', 'running', 'idle']
  await delay(STEP_DELAY)

  const res = await fetchP
  elapsedMs.value = Math.round(performance.now() - startedAt)

  if (!res.ok) {
    stepStates.value = ['done', 'failed', 'idle']
    networkError.value = res.err?.message ?? '서버에 연결할 수 없습니다.'
    loading.value = false
    return
  }

  raw.value = res.data
  const p = parseKeygenResponse(res.data)
  const { regions, truncated } = await regionsP
  if (regions.length > 1) {
    // 같은 주소가 여러 지역에 존재 — 매칭 성공/실패와 관계없이 키를 확정하지 않고 지역 선택을 받는다
    // (흔한 주소는 매칭이 임의 지역으로 확정되거나 아예 실패하는데, 두 경우 모두 지역 선택으로 복구된다)
    stepStates.value = ['done', 'done', 'idle']
    regionChoices.value = regions
    regionsTruncated.value = truncated
  } else if (!p.ok) {
    stepStates.value = ['done', 'failed', 'idle']
    parsed.value = p
    history.add({ addr: address, upperPk: '', pks: [], ok: false })
  } else {
    stepStates.value = ['done', 'done', 'running']
    await delay(STEP_DELAY)
    stepStates.value = ['done', 'done', 'done']
    parsed.value = p
    history.add({ addr: address, upperPk: p.result.upperPk, pks: p.result.pks, ok: true })
    // 성공한 경우에만 위치 표시 — 다지역·실패 케이스의 좌표는 임의 지역일 수 있어 쓰지 않는다
    coord.value = await coordP
    // 동 정보(동 이름·주/부속 구분)는 결과 표시를 막지 않도록 백그라운드로 이어서 조회
    void loadDongInfos()
  }
  loading.value = false

  await nextTick()
  resultSection.value?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'nearest' })
}

// 대장 정보 모달 — 전체 기능 페이지로 이동하지 않고 모달에서 확인(BldInfoDialog)
const infoOpen = ref(false)
const infoPk = ref('')
function openInfo(pk: string) {
  infoPk.value = pk
  infoOpen.value = true
}

// 신규 PK 전환 모달 — 페이지 이동 없이 변환 기능을 직접 호출해 결과를 보여준다
const convertOpen = ref(false)
/** 변환 대상(기존) PK */
const convertSrcPk = ref('')
const convertLoading = ref(false)
const convertRaw = ref<unknown>(null)
const convertResult = ref<ConvertResult | null>(null)
const convertNetError = ref('')
// 모달을 빠르게 다시 열었을 때 이전 호출 결과를 무시하는 실행 토큰
let convertRunId = 0

async function openConvert(pk: string) {
  convertOpen.value = true
  convertSrcPk.value = pk
  convertLoading.value = true
  convertRaw.value = null
  convertResult.value = null
  convertNetError.value = ''
  const run = ++convertRunId
  try {
    const data = await $fetch(useRuntimeConfig().public.apiBase + CONVERT_PATH, {
      query: { mgm_bld_pk: pk },
      timeout: 10000,
    })
    if (run !== convertRunId) return
    convertRaw.value = data
    convertResult.value = parseConvertResponse(data)
  } catch {
    if (run !== convertRunId) return
    convertNetError.value = '서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.'
  } finally {
    if (run === convertRunId) convertLoading.value = false
  }
}

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    toast('표준연계키를 클립보드에 복사했습니다.')
  } catch {
    toast('복사에 실패했습니다. 브라우저 권한을 확인해 주세요.', 'error')
  }
}

/** 생성 결과 전체(주소·키·등급)를 텍스트로 복사 — 보고서·메일 붙여넣기용 */
async function copySummary() {
  const r = success.value
  if (!r) return
  const lines = [
    '[표준연계키 생성 결과]',
    `입력 주소: ${lastAddr.value}`,
    `정제 주소: ${r.cleanAddr || '-'}`,
    `총괄표제부 PK: ${r.upperPk || '-'}`,
    `표제부 PK (${r.pks.length}건): ${r.pks.join(', ') || '-'}`,
    `매칭 등급: ${[r.grade, r.level].filter(Boolean).join(' · ') || '-'}`,
  ]
  try {
    await navigator.clipboard.writeText(lines.join('\n'))
    toast('생성 결과 요약을 클립보드에 복사했습니다.')
  } catch {
    toast('복사에 실패했습니다. 브라우저 권한을 확인해 주세요.', 'error')
  }
}

/** 최근 생성 항목 클릭 — 주소 복원 후 바로 재생성한다 */
/** 현재 결과의 공유 링크(?addr=) 복사 */
async function copyLink() {
  try {
    await navigator.clipboard.writeText(location.href)
    toast('생성 결과 링크를 클립보드에 복사했습니다.')
  } catch {
    toast('복사에 실패했습니다. 브라우저 권한을 확인해 주세요.', 'error')
  }
}

/** 다지역 후보에서 지역 선택 — 해당 지역 전체 주소로 바로 재생성 */
function selectRegion(c: RegionCandidate) {
  addr.value = c.roadAddr || `${c.si} ${c.sgg} ${lastAddr.value}`
  generate()
}

/** 실패 응답에 담긴 서버 발견 유사 주소로 재시도 */
function retrySimilar(a: string) {
  addr.value = a
  generate()
}

function restoreAddr(v: string) {
  if (loading.value) return
  addr.value = v
  window.scrollTo({ top: 0, behavior: 'smooth' })
  generate()
}

function formatTime(ts: number) {
  const d = new Date(ts)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function keySummary(item: { upperPk: string; pks: string[] }) {
  // upperPk는 콤마 구분 다건일 수 있어 첫 건만 대표로 쓰고 나머지는 건수로 표기한다
  const uppers = splitPks(item.upperPk)
  const main = uppers[0] || item.pks[0] || ''
  const rest = uppers.length ? uppers.length - 1 + item.pks.length : item.pks.length - 1
  return rest > 0 ? `${main} 외 ${rest}건` : main
}
</script>

<template>
  <main class="mx-auto w-full max-w-3xl px-6 pb-20">
    <!-- 히어로 + 입력 -->
    <header class="pt-14 pb-8 text-center">
      <h1 class="text-2xl sm:text-3xl">주소로 표준연계키를 생성합니다</h1>
      <p class="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground">
        건물 주소를 입력하면 주소 정제와 건축물대장 매칭을 거쳐<br class="hidden sm:block" />
        표준연계키(건축물대장 PK)가 생성됩니다.
      </p>
    </header>

    <section class="rounded-xl border bg-card p-5 shadow-sm" aria-label="표준연계키 생성">
      <div class="flex flex-col gap-2.5 sm:flex-row">
        <div class="relative flex-1">
          <Input
            ref="addrInput"
            v-model="addr"
            class="h-11 w-full text-base"
            placeholder="예: 대청로 119"
            aria-label="건물 주소"
            role="combobox"
            aria-autocomplete="list"
            :aria-expanded="suggestOpen"
            aria-controls="addr-suggest-list"
            :aria-activedescendant="
              suggestActive >= 0 ? `addr-suggest-${suggestActive}` : undefined
            "
            @input="onAddrInput"
            @keydown="onAddrKeydown"
            @keyup.enter="onAddrEnter"
            @blur="suggestOpen = false"
          />
          <!-- 자동완성 후보 — 타이핑 중에만 표시, 선택 즉시 해당 주소로 생성 -->
          <ul
            v-if="suggestOpen"
            id="addr-suggest-list"
            role="listbox"
            aria-label="주소 자동완성 후보"
            class="absolute top-full right-0 left-0 z-20 mt-1 max-h-72 overflow-auto rounded-md border bg-card py-1 shadow-md"
          >
            <li
              v-for="(s, i) in suggestions"
              :id="`addr-suggest-${i}`"
              :key="s.roadAddr"
              role="option"
              :aria-selected="i === suggestActive"
            >
              <button
                type="button"
                class="flex w-full flex-wrap items-baseline gap-x-2 px-3 py-2 text-left text-sm transition-colors"
                :class="i === suggestActive ? 'bg-primary/10' : 'hover:bg-primary/5'"
                tabindex="-1"
                @mousedown.prevent
                @click="pickSuggestion(s)"
              >
                <span>{{ s.roadAddr }}</span>
                <span v-if="s.bldNm" class="text-xs text-muted-foreground">{{ s.bldNm }}</span>
              </button>
            </li>
          </ul>
        </div>
        <Button
          class="h-11 px-6"
          :disabled="loading || !addr.trim() || !!pkKind"
          @click="generate()"
        >
          {{ loading ? '생성 중…' : '표준연계키 생성' }}
        </Button>
      </div>

      <!-- PK 직접 입력 감지 — 주소 생성 대신 조회·전환 액션 제시 -->
      <div v-if="pkKind" class="mt-3 rounded-lg border border-primary/30 bg-primary/5 px-4 py-3">
        <p class="text-sm font-medium">
          표준연계키({{ pkKind === 'old' ? '기존' : '신규' }} 형식)가 입력되었습니다
        </p>
        <p class="mt-0.5 text-xs text-muted-foreground">
          <template v-if="pkKind === 'old'">
            이미 생성된 키라면 주소 입력 없이 바로 조회하거나 전환할 수 있습니다.
          </template>
          <template v-else>
            신규 형식 키는 건축물대장 정보 조회가 되지 않아, 먼저 기존 PK로 전환한 뒤 조회할 수
            있습니다.
          </template>
        </p>
        <div class="mt-2.5 flex flex-wrap gap-2">
          <template v-if="pkKind === 'old'">
            <Button variant="outline" size="sm" @click="openInfo(addr.trim())">
              건축물대장 정보 보기
            </Button>
            <Button variant="outline" size="sm" @click="openConvert(addr.trim())">
              신규 PK 전환
            </Button>
          </template>
          <NuxtLink
            v-else
            :to="{
              path: '/tools',
              query: { path: NEW2OLD_PATH, mgm_bld_pk_new: addr.trim(), run: '1' },
            }"
            :class="buttonVariants({ variant: 'outline', size: 'sm' })"
          >
            기존 PK로 전환
          </NuxtLink>
        </div>
      </div>

      <div class="mt-3 flex flex-wrap items-center gap-1.5">
        <span class="mr-1 text-xs text-muted-foreground">예시 주소:</span>
        <button
          v-for="s in SAMPLE_ADDRS"
          :key="s"
          class="rounded-full bg-secondary px-3 py-1 text-xs transition-colors hover:bg-primary/10"
          @click="fillSample(s)"
        >
          {{ s.split(' ').slice(-2).join(' ') }}
        </button>
      </div>

      <!-- 생성 파이프라인 -->
      <div
        v-if="started"
        class="mt-5 grid grid-cols-[1fr_auto_1fr_auto_1fr] items-start gap-1.5 border-t pt-5"
        aria-live="polite"
      >
        <template v-for="(step, i) in STEPS" :key="step.name">
          <div v-if="i > 0" class="mt-4 h-px min-w-4 bg-border" aria-hidden="true" />
          <div class="text-center">
            <div
              class="mx-auto mb-1.5 flex size-8 items-center justify-center rounded-full text-xs font-bold transition-colors"
              :class="{
                'bg-secondary text-muted-foreground': stepStates[i] === 'idle',
                'bg-primary/10 text-primary': stepStates[i] === 'running',
                'bg-success/10 text-success': stepStates[i] === 'done',
                'bg-destructive/10 text-destructive': stepStates[i] === 'failed',
              }"
            >
              <template v-if="stepStates[i] === 'done'">✓</template>
              <template v-else-if="stepStates[i] === 'failed'">✕</template>
              <template v-else>{{ i + 1 }}</template>
            </div>
            <p class="text-xs font-semibold">{{ step.name }}</p>
            <p class="text-[11px] text-muted-foreground">{{ step.desc }}</p>
          </div>
        </template>
        <!-- 생성 1회에 실제 호출되는 기능 — 매칭 + 다지역 감지용 주소검색 + 위치 좌표 -->
        <ApiUsageNote
          class="col-span-full mt-2 justify-center"
          :paths="[MATCH_PATH, JUSO_PATH, COORD_PATH]"
        />
      </div>
    </section>

    <!-- 결과 -->
    <section ref="resultSection" class="scroll-mt-16" aria-label="생성 결과" aria-live="polite">
      <!-- 성공: 키 카드 -->
      <div v-if="success" class="mt-5 overflow-hidden rounded-xl border bg-card shadow-sm">
        <div class="border-b bg-primary/5 px-5 py-4">
          <p
            class="flex items-center gap-2 text-[11px] font-bold tracking-widest text-primary uppercase"
          >
            표준연계키
            <Badge class="border-transparent bg-success text-[11px] text-success-foreground">
              생성 완료
            </Badge>
            <span class="font-mono font-normal text-muted-foreground normal-case">
              {{ elapsedMs }}ms
            </span>
          </p>
          <div class="mt-2 flex flex-wrap items-center gap-3">
            <span v-if="mainPk" class="font-mono text-2xl font-semibold break-all sm:text-3xl">
              {{ mainPk }}
            </span>
            <span v-else-if="multiUpper" class="text-xl font-semibold">
              총괄표제부 {{ upperPks.length }}건
            </span>
            <span v-else class="text-xl font-semibold">대표 키 없음</span>
            <Button v-if="mainPk" variant="outline" size="sm" @click="copy(mainPk)">복사</Button>
            <Button variant="outline" size="sm" @click="copySummary()">요약 복사</Button>
            <Button variant="outline" size="sm" @click="copyLink()">링크 복사</Button>
          </div>
          <!-- 대표 키 라벨(표제부/총괄표제부 PK)은 안내 문구보다 크고 굵게 -->
          <p class="mt-1 text-muted-foreground" :class="mainPk ? 'text-sm font-bold' : 'text-xs'">
            <template v-if="mainPk">{{ mainPkLabel }}</template>
            <template v-else-if="multiUpper">
              총괄표제부가 {{ upperPks.length }}건 등재된 주소입니다 — 아래에서 총괄별 표제부를
              확인해 사용하세요
            </template>
            <template v-else-if="noRepresentative">
              총괄표제부가 등재되지 않은 주소입니다 — 아래 표제부
              {{ success.pks.length }}건에서 건물을 확인해 사용하세요
            </template>
          </p>
        </div>

        <!-- 표제부 PK 목록 (총괄 PK가 있거나 여러 건일 때) — 동 정보 로드 후 주/부속건축물 구분 -->
        <div v-if="pkList.length || multiUpper" class="border-b px-5 py-3">
          <div class="flex items-center justify-between">
            <p v-if="pkList.length" class="text-xs font-medium text-muted-foreground">
              표제부 PK {{ pkList.length }}건
            </p>
            <p v-else class="text-xs font-medium text-muted-foreground">
              총괄표제부 PK {{ upperPks.length }}건
            </p>
            <span
              v-if="dongLoading"
              class="flex items-center gap-1.5 text-xs text-muted-foreground"
            >
              <span
                class="size-3.5 animate-spin rounded-full border-2 border-primary/30 border-t-primary"
              />
              동 정보 불러오는 중…
            </span>
          </div>
          <ApiUsageNote class="mt-0.5" label="동 정보 조회" :paths="[INFO_PATH]" />
          <p v-if="!dongLoaded" class="mt-0.5 text-xs text-muted-foreground">
            주거동 외 부속건축물(주차장·경비실 등)·상가가 동별로 포함될 수 있습니다
          </p>
          <!-- 총괄이 여러 건이면 총괄별 그룹, 아니면 단일 그룹(헤더 없음)으로 렌더링 -->
          <div
            v-for="g in pkGroups"
            :key="g.key"
            :class="g.upperPk || g.key === 'etc' ? 'mt-3 overflow-hidden rounded-lg border' : ''"
          >
            <div
              v-if="g.upperPk"
              class="flex flex-wrap items-center gap-2 bg-primary/5 px-3 py-2"
              :class="groupOpen[g.key] ? 'border-b' : ''"
            >
              <!-- 헤더 왼쪽 전체가 본문 접기/펼치기 토글 -->
              <button
                type="button"
                class="flex min-w-0 flex-1 items-center gap-2 text-left"
                :aria-expanded="!!groupOpen[g.key]"
                @click="groupOpen[g.key] = !groupOpen[g.key]"
              >
                <span
                  aria-hidden="true"
                  class="inline-block text-xs text-muted-foreground transition-transform"
                  :class="groupOpen[g.key] ? 'rotate-90' : ''"
                >
                  ▶
                </span>
                <span class="min-w-0 flex-1">
                  <span class="block text-[11px] font-medium text-muted-foreground">
                    총괄표제부 PK
                  </span>
                  <span class="block font-mono text-base font-semibold break-all">
                    {{ g.upperPk }}
                    <span
                      v-if="dongText(g.upperPk) && dongText(g.upperPk) !== '-'"
                      class="ml-1 font-sans text-xs font-normal text-muted-foreground"
                    >
                      {{ dongText(g.upperPk) }}
                    </span>
                    <span
                      v-if="dongLoaded"
                      class="ml-1 font-sans text-xs font-normal text-muted-foreground"
                    >
                      표제부 {{ g.pks.length }}건
                    </span>
                  </span>
                </span>
              </button>
              <Button variant="ghost" size="sm" class="h-9 text-xs md:h-7" @click="copy(g.upperPk)">
                복사
              </Button>
              <Button
                variant="ghost"
                size="sm"
                class="h-9 text-xs md:h-7"
                @click="openInfo(g.upperPk)"
              >
                대장 정보
              </Button>
              <Button
                variant="ghost"
                size="sm"
                class="h-9 text-xs md:h-7"
                @click="openConvert(g.upperPk)"
              >
                신규 PK 전환
              </Button>
            </div>
            <div
              v-else-if="g.key === 'etc'"
              class="border-b bg-muted px-3 py-2 text-xs font-medium text-muted-foreground"
            >
              {{ dongLoaded ? '소속 총괄 미확인' : '소속 총괄 확인 중…' }}
            </div>
            <div
              v-if="!g.upperPk || groupOpen[g.key]"
              :class="g.upperPk || g.key === 'etc' ? 'px-3 pb-2' : ''"
            >
              <p v-if="dongLoaded && groupSubPks(g).length" class="mt-2 text-xs font-medium">
                주건축물 {{ groupMainPks(g).length }}건
              </p>
              <ul class="mt-1.5 divide-y">
                <li v-for="pk in groupMainPks(g)" :key="pk" class="flex items-center gap-2 py-1.5">
                  <span class="flex-1 font-mono text-sm break-all">
                    {{ pk }}
                    <span v-if="dongText(pk)" class="ml-1 font-sans text-xs text-muted-foreground">
                      {{ dongText(pk) }}
                    </span>
                  </span>
                  <Button variant="ghost" size="sm" class="h-9 text-xs md:h-7" @click="copy(pk)">
                    복사
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    class="h-9 text-xs md:h-7"
                    @click="openInfo(pk)"
                  >
                    대장 정보
                  </Button>
                </li>
              </ul>
              <!-- 부속건축물 — 주건축물 목록과 구분되도록 배경이 깔린 박스 안에 토글·목록을 묶는다 -->
              <div
                v-if="groupSubPks(g).length"
                class="mt-2 mb-2 overflow-hidden rounded-md border bg-muted/40"
              >
                <button
                  type="button"
                  class="flex w-full items-center gap-2 bg-muted px-3 py-2 text-sm font-medium transition-colors hover:bg-muted/80"
                  :aria-expanded="!!subOpen[g.key]"
                  @click="subOpen[g.key] = !subOpen[g.key]"
                >
                  <span
                    aria-hidden="true"
                    class="inline-block text-xs text-muted-foreground transition-transform"
                    :class="subOpen[g.key] ? 'rotate-90' : ''"
                  >
                    ▶
                  </span>
                  부속건축물 {{ groupSubPks(g).length }}건
                  <span class="font-normal text-muted-foreground">
                    (주차장·경비실·주민공동시설 등)
                  </span>
                  <span class="ml-auto text-xs font-normal text-muted-foreground">
                    {{ subOpen[g.key] ? '접기' : '펼치기' }}
                  </span>
                </button>
                <ul v-if="subOpen[g.key]" class="divide-y border-t px-3">
                  <li v-for="pk in groupSubPks(g)" :key="pk" class="flex items-center gap-2 py-1.5">
                    <span class="flex-1 font-mono text-[13px] break-all text-muted-foreground">
                      {{ pk }}
                      <span v-if="dongText(pk)" class="ml-1 font-sans text-xs">
                        {{ dongText(pk) }}
                      </span>
                    </span>
                    <Button variant="ghost" size="sm" class="h-9 text-xs md:h-7" @click="copy(pk)"
                      >복사</Button
                    >
                    <Button
                      variant="ghost"
                      size="sm"
                      class="h-9 text-xs md:h-7"
                      @click="openInfo(pk)"
                    >
                      대장 정보
                    </Button>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>

        <dl class="grid grid-cols-[7.5rem_1fr] gap-y-0 px-5 py-2 text-sm">
          <dt class="border-b py-2.5 text-muted-foreground">정제된 주소</dt>
          <dd class="border-b py-2.5">{{ success.cleanAddr || '—' }}</dd>
          <dt class="border-b py-2.5 text-muted-foreground">지번 주소</dt>
          <dd class="border-b py-2.5">{{ success.platAddr || '—' }}</dd>
          <dt class="border-b py-2.5 text-muted-foreground">법정동코드</dt>
          <dd class="border-b py-2.5 font-mono text-[13px]">{{ success.legalCode || '—' }}</dd>
          <dt class="py-2.5 text-muted-foreground" :class="coord ? 'border-b' : ''">매칭 등급</dt>
          <dd
            class="flex flex-wrap items-center gap-x-2 gap-y-1 py-2.5"
            :class="coord ? 'border-b' : ''"
          >
            <span v-if="success.grade" class="font-mono text-[13px]">
              {{ success.grade }}<template v-if="success.level"> · {{ success.level }}</template>
            </span>
            <template v-else>—</template>
            <template v-if="gradeInfo">
              <span class="text-xs text-muted-foreground">{{ gradeInfo.short }}</span>
              <TooltipProvider :delay-duration="200">
                <Tooltip>
                  <TooltipTrigger as-child>
                    <button
                      type="button"
                      aria-label="매칭 등급 설명"
                      class="flex size-4 items-center justify-center rounded-full border text-[10px] text-muted-foreground hover:bg-primary/5"
                    >
                      ?
                    </button>
                  </TooltipTrigger>
                  <TooltipContent class="max-w-72">
                    <p class="font-medium">{{ success.grade }} — {{ gradeInfo.short }}</p>
                    <p class="mt-1">{{ gradeInfo.desc }}</p>
                    <p v-if="success.level && describeLevel(success.level)" class="mt-1">
                      {{ success.level }}: {{ describeLevel(success.level) }}
                    </p>
                    <p class="mt-1.5 opacity-70">{{ GRADE_DISCLAIMER }}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </template>
          </dd>
          <template v-if="coord">
            <dt class="py-2.5 text-muted-foreground">위치</dt>
            <dd class="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5">
              <span class="font-mono text-[13px]">
                {{ coord.lat.toFixed(6) }}, {{ coord.lng.toFixed(6) }}
              </span>
              <button
                type="button"
                class="text-xs font-medium text-primary underline-offset-2 hover:underline"
                :aria-expanded="mapOpen"
                @click="mapOpen = !mapOpen"
              >
                {{ mapOpen ? '지도 접기' : '지도에서 위치 확인' }}
              </button>
              <a
                :href="`https://map.kakao.com/link/map/${encodeURIComponent(success.cleanAddr || lastAddr)},${coord.lat},${coord.lng}`"
                target="_blank"
                rel="noopener noreferrer"
                class="text-xs text-muted-foreground underline-offset-2 hover:underline"
              >
                카카오맵 ↗
              </a>
            </dd>
          </template>
        </dl>

        <!-- 미니 지도 — 펼칠 때만 Leaflet을 로드한다 -->
        <div v-if="coord && mapOpen" class="px-5 pb-4">
          <MiniMap :lat="coord.lat" :lng="coord.lng" :label="success.cleanAddr || lastAddr" />
        </div>

        <div class="flex flex-wrap gap-2 border-t px-5 py-3.5">
          <Button
            v-if="!pkList.length && mainPk"
            variant="outline"
            size="sm"
            @click="openInfo(mainPk)"
          >
            건축물대장 정보 보기
          </Button>
          <Button v-if="mainPk" variant="outline" size="sm" @click="openConvert(mainPk)">
            신규 PK 전환
          </Button>
          <NuxtLink
            :to="{ path: '/tools', query: { path: MATCH_PATH, input_addr: lastAddr, run: '1' } }"
            :class="buttonVariants({ variant: 'outline', size: 'sm' })"
          >
            전체 기능에서 열기
          </NuxtLink>
        </div>
      </div>

      <!-- 다지역 모호: 같은 주소가 여러 시군구에 존재 — 지역을 선택받아 재생성 -->
      <div
        v-else-if="regionChoices.length"
        class="mt-5 rounded-xl border border-primary/30 bg-card p-5 shadow-sm"
      >
        <p class="text-sm font-semibold">같은 주소가 여러 지역에 있습니다</p>
        <p class="mt-1.5 text-sm text-muted-foreground">
          입력한 주소가 {{ regionChoices.length }}개 지역에서 발견되었습니다. 아래에서 지역을
          선택하면 해당 주소로 표준연계키를 생성합니다.
        </p>
        <ul class="mt-3 divide-y overflow-hidden rounded-lg border">
          <li v-for="c in regionChoices" :key="c.si + ' ' + c.sgg">
            <button
              type="button"
              class="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm transition-colors hover:bg-primary/5"
              @click="selectRegion(c)"
            >
              <span class="font-medium whitespace-nowrap">{{ c.si }} {{ c.sgg }}</span>
              <span class="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                {{ c.roadAddr }}<template v-if="c.bldNm"> · {{ c.bldNm }}</template>
              </span>
              <span class="shrink-0 text-xs font-medium text-primary">선택</span>
            </button>
          </li>
        </ul>
        <p class="mt-2.5 text-xs text-muted-foreground">
          <template v-if="regionsTruncated">
            전국에 같은 주소가 더 있어 일부 지역만 표시되었습니다.
          </template>
          찾는 지역이 목록에 없으면 시·도부터 포함해 직접 입력해 주세요.
        </p>
      </div>

      <!-- 실패: 매칭 실패 / 연결 오류 -->
      <div
        v-else-if="(parsed && !parsed.ok) || networkError"
        role="alert"
        class="mt-5 rounded-xl border border-destructive/30 bg-card p-5 shadow-sm"
      >
        <p class="text-sm font-semibold text-destructive">
          {{ networkError ? '서버에 연결하지 못했습니다' : '표준연계키를 생성하지 못했습니다' }}
        </p>
        <p class="mt-1.5 text-sm text-muted-foreground">
          {{
            networkError
              ? '네트워크 상태를 확인한 뒤 다시 시도해 주세요. 문제가 계속되면 헤더의 서버 상태 표시를 확인해 주세요.'
              : parsed && !parsed.ok
                ? parsed.message
                : ''
          }}
        </p>
        <!-- 기술적 오류 원문은 접어서 제공 — 화면 기본 문구는 평이한 안내로 통일 -->
        <details v-if="networkError" class="mt-2">
          <summary class="cursor-pointer text-xs text-muted-foreground select-none">
            오류 원문 보기
          </summary>
          <p class="mt-1 rounded-md bg-secondary px-3 py-2 font-mono text-xs break-all">
            {{ networkError }}
          </p>
        </details>
        <p
          v-if="parsed && !parsed.ok && parsed.cleanAddr"
          class="mt-2 rounded-md bg-secondary px-3 py-2 text-sm"
        >
          정제 결과: {{ parsed.cleanAddr }}
        </p>
        <!-- 서버가 찾은 유사 주소 — 1클릭 재시도 -->
        <div
          v-if="parsed && !parsed.ok && parsed.similarAddr"
          class="mt-2 flex flex-wrap items-center gap-2 rounded-md bg-secondary px-3 py-2 text-sm"
        >
          <span class="text-muted-foreground">찾은 유사 주소:</span>
          <span class="font-medium">{{ parsed.similarAddr }}</span>
          <Button
            variant="outline"
            size="sm"
            class="h-9 text-xs md:h-7"
            @click="retrySimilar(parsed.similarAddr)"
          >
            이 주소로 다시 시도
          </Button>
        </div>
        <ul
          v-if="!networkError"
          class="mt-3 list-disc pl-5 text-xs leading-relaxed text-muted-foreground"
        >
          <li>시·군·구부터 도로명(또는 지번)·건물번호까지 포함해 다시 시도해 보세요.</li>
          <li>동·호수 등 상세 주소는 빼는 것이 매칭에 유리합니다.</li>
        </ul>
        <div class="mt-4">
          <NuxtLink
            :to="{ path: '/tools', query: { path: MATCH_PATH, input_addr: lastAddr } }"
            :class="buttonVariants({ variant: 'outline', size: 'sm' })"
          >
            전체 기능에서 다른 방식으로 시도
          </NuxtLink>
        </div>
      </div>

      <!-- 원본 응답 -->
      <details v-if="raw != null" class="mt-3">
        <summary class="cursor-pointer text-xs text-muted-foreground select-none">
          원본 응답(JSON) 보기 — 검증용
        </summary>
        <div class="mt-2 overflow-x-auto rounded-lg border bg-card p-3">
          <JsonViewer :data="raw" />
        </div>
      </details>
    </section>

    <!-- 최근 생성 -->
    <section v-if="history.items.value.length" class="mt-10" aria-label="최근 생성 이력">
      <div class="flex items-center justify-between">
        <h2 class="text-xs font-semibold text-muted-foreground">최근 생성</h2>
        <Button
          variant="ghost"
          size="sm"
          class="h-9 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive md:h-7"
          @click="clearHistory()"
        >
          전체 삭제
        </Button>
      </div>
      <ul class="mt-2 divide-y rounded-lg border bg-card">
        <li
          v-for="item in history.items.value"
          :key="item.id"
          tabindex="0"
          class="flex cursor-pointer items-center gap-3 px-4 py-2.5 text-sm transition-colors hover:bg-primary/5 focus-visible:bg-primary/5 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
          @click="restoreAddr(item.addr)"
          @keydown.enter.prevent="restoreAddr(item.addr)"
          @keydown.space.prevent="restoreAddr(item.addr)"
        >
          <span
            v-if="item.ok"
            class="shrink-0 font-mono text-xs font-semibold whitespace-nowrap text-primary"
          >
            {{ keySummary(item) }}
          </span>
          <Badge v-else class="shrink-0 border-transparent bg-destructive text-[11px] text-white">
            실패
          </Badge>
          <span class="min-w-0 flex-1 truncate text-muted-foreground">{{ item.addr }}</span>
          <span class="shrink-0 text-xs text-muted-foreground">{{ formatTime(item.ts) }}</span>
        </li>
      </ul>
      <p class="mt-1.5 text-[11px] text-muted-foreground">
        이 브라우저에만 저장됩니다. 항목을 클릭하면 해당 주소로 다시 생성합니다.
      </p>
    </section>

    <!-- 신규 PK 전환 Modal — 페이지 이동 없이 변환 결과 표시 -->
    <Dialog v-model:open="convertOpen">
      <DialogScrollContent class="max-w-lg">
        <DialogHeader>
          <DialogTitle>신규 PK 전환</DialogTitle>
          <DialogDescription> 기존 건축물대장 PK를 신규 형식의 PK로 변환합니다 </DialogDescription>
        </DialogHeader>
        <dl class="grid grid-cols-[5.5rem_1fr] items-center gap-y-1 text-sm">
          <dt class="py-1.5 text-muted-foreground">기존 PK</dt>
          <dd class="py-1.5 font-mono break-all">{{ convertSrcPk }}</dd>
          <dt class="py-1.5 text-muted-foreground">신규 PK</dt>
          <dd class="py-1.5">
            <span v-if="convertLoading" class="flex items-center gap-2 text-muted-foreground">
              <span
                class="size-3.5 animate-spin rounded-full border-2 border-primary/30 border-t-primary"
              />
              변환 중…
            </span>
            <span v-else-if="convertNetError" class="text-destructive">
              {{ convertNetError }}
            </span>
            <span v-else-if="convertResult?.error" class="text-muted-foreground">
              {{ convertResult.error }}
            </span>
            <span
              v-else-if="convertResult?.newPk"
              class="flex flex-wrap items-center gap-2 font-mono text-lg font-semibold break-all"
            >
              {{ convertResult.newPk }}
              <Button variant="outline" size="sm" @click="copy(convertResult.newPk)">복사</Button>
            </span>
          </dd>
        </dl>
        <ApiUsageNote :paths="[CONVERT_PATH]" />
        <details v-if="convertRaw != null">
          <summary class="cursor-pointer text-xs text-muted-foreground select-none">
            원본 응답(JSON) 보기 — 검증용
          </summary>
          <div class="mt-2 overflow-x-auto rounded-lg border bg-card p-3">
            <JsonViewer :data="convertRaw" />
          </div>
        </details>
      </DialogScrollContent>
    </Dialog>

    <!-- 대장 정보 Modal -->
    <BldInfoDialog v-model:open="infoOpen" :pk="infoPk" />
  </main>
</template>
