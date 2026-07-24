<script setup lang="ts">
import { Badge } from '@/components/ui/badge'
import { Button, buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  extractDongInfo,
  extractRegionCandidates,
  isRegionListTruncated,
  parseKeygenResponse,
  type DongInfo,
  type KeygenParse,
  type RegionCandidate,
} from '~/lib/keygen'

/** 단건 생성에 사용하는 대표 기능 — 주소정제 후 건축물대장번호 매칭 (3차년도) */
const MATCH_PATH = '/sqiapi/addr/building_match_clean_union'
/** 키 카드에서 건축물대장 정보로 이어지는 기능 */
const INFO_PATH = '/sqiapi/addr/mgm_bld_pk_info/{mgmbldpk}'
/** 키 카드에서 신규 PK → 기존 PK 변환으로 이어지는 기능 */
const CONVERT_PATH = '/sqiapi/addr/convert_mgm_bld_pk_new_to_old'
/** 다지역 모호 감지에 사용하는 주소검색 기능(주소기반산업지원서비스) */
const JUSO_PATH = '/sqiapi/addr/asis/juso'

const SAMPLE_ADDRS = [
  '경기도 고양시 일산서구 고양대로 283',
  '서울특별시 중구 세종대로 110',
  '부산광역시 해운대구 센텀중앙로 79',
]

const STEPS = [
  { name: '주소 정제', desc: '표준 주소로 변환' },
  { name: '건축물대장 매칭', desc: '대장 정보 대조' },
  { name: '표준연계키 생성', desc: '키 발급 완료' },
] as const
const STEP_DELAY = 450

const { toast } = useToast()
const history = useKeygenHistory()

const addr = ref('')
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

const success = computed(() => (parsed.value?.ok ? parsed.value.result : null))
/** 총괄표제부가 없고 표제부가 여러 건이면 대표 키를 정할 수 없다 — 목록에서 선택하게 안내 */
const noRepresentative = computed(
  () => !!success.value && !success.value.upperPk && success.value.pks.length > 1,
)
/** 대표 키 — 총괄표제부 PK 우선, 없으면 단독 표제부 PK (다건이면 빈 값) */
const mainPk = computed(() => {
  const r = success.value
  if (!r) return ''
  return r.upperPk || (r.pks.length === 1 ? r.pks[0]! : '')
})
const mainPkLabel = computed(() => (success.value?.upperPk ? '총괄표제부 PK' : '표제부 PK'))
/** 표제부 PK 전체 목록 — 총괄 PK가 있거나 2건 이상일 때만 별도 목록으로 노출 */
const pkList = computed(() => {
  const r = success.value
  if (!r) return []
  return r.upperPk || r.pks.length > 1 ? r.pks : []
})

// 표제부 PK별 동 정보(동 이름·주/부속 구분) — 건당 추가 호출이 필요해 생성 완료 직후 백그라운드로 조회한다
const dongInfos = ref<Record<string, DongInfo>>({})
const dongLoading = ref(false)
const dongLoaded = ref(false)
const subListOpen = ref(false)
// 재생성 시 진행 중이던 이전 조회를 무효화하는 실행 토큰
let dongRunId = 0

async function loadDongInfos() {
  const pks = pkList.value
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
          dongInfos.value[pk] = { label: '-', isSub: false, purps: '' }
        }
      }
    }),
  )
  if (run !== dongRunId) return
  dongLoading.value = false
  dongLoaded.value = true
}

/** 로드 후 주건축물/부속건축물 분리 목록 — 부속이 없으면 그룹핑 없이 전체를 주건축물로 취급 */
const mainPks = computed(() =>
  dongLoaded.value ? pkList.value.filter((pk) => !dongInfos.value[pk]?.isSub) : pkList.value,
)
const subPks = computed(() =>
  dongLoaded.value ? pkList.value.filter((pk) => dongInfos.value[pk]?.isSub) : [],
)

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

async function generate() {
  const address = addr.value.trim()
  if (!address || loading.value) return

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
  subListOpen.value = false
  regionChoices.value = []
  regionsTruncated.value = false
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
    // 동 정보(동 이름·주/부속 구분)는 결과 표시를 막지 않도록 백그라운드로 이어서 조회
    void loadDongInfos()
  }
  loading.value = false

  await nextTick()
  resultSection.value?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'nearest' })
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
    `입력 주소: ${addr.value.trim()}`,
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
  addr.value = c.roadAddr || `${c.si} ${c.sgg} ${addr.value.trim()}`
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
  const main = item.upperPk || item.pks[0] || ''
  const rest = item.pks.length - (item.upperPk ? 0 : 1)
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
        <Input
          ref="addrInput"
          v-model="addr"
          class="h-11 flex-1 text-base"
          placeholder="예: 경기도 고양시 일산서구 고양대로 283"
          aria-label="건물 주소"
          @keyup.enter="generate()"
        />
        <Button class="h-11 px-6" :disabled="loading || !addr.trim()" @click="generate()">
          {{ loading ? '생성 중…' : '표준연계키 생성' }}
        </Button>
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
            <span v-else class="text-xl font-semibold">대표 키 없음</span>
            <Button v-if="mainPk" variant="outline" size="sm" @click="copy(mainPk)">복사</Button>
            <Button variant="outline" size="sm" @click="copySummary()">요약 복사</Button>
            <Button variant="outline" size="sm" @click="copyLink()">링크 복사</Button>
          </div>
          <p class="mt-1 text-xs text-muted-foreground">
            <template v-if="mainPk">{{ mainPkLabel }}</template>
            <template v-else-if="noRepresentative">
              총괄표제부가 등재되지 않은 주소입니다 — 아래 표제부
              {{ success.pks.length }}건에서 건물을 확인해 사용하세요
            </template>
          </p>
        </div>

        <!-- 표제부 PK 목록 (총괄 PK가 있거나 여러 건일 때) — 동 정보 로드 후 주/부속건축물 구분 -->
        <div v-if="pkList.length" class="border-b px-5 py-3">
          <div class="flex items-center justify-between">
            <p class="text-xs font-medium text-muted-foreground">표제부 PK {{ pkList.length }}건</p>
            <span v-if="dongLoading" class="text-xs text-muted-foreground">
              동 정보 불러오는 중…
            </span>
          </div>
          <p v-if="!dongLoaded" class="mt-0.5 text-xs text-muted-foreground">
            주거동 외 부속건축물(주차장·경비실 등)·상가가 동별로 포함될 수 있습니다
          </p>
          <p v-if="dongLoaded && subPks.length" class="mt-2 text-xs font-medium">
            주건축물 {{ mainPks.length }}건
          </p>
          <ul class="mt-1.5 divide-y">
            <li v-for="pk in mainPks" :key="pk" class="flex items-center gap-2 py-1.5">
              <span class="flex-1 font-mono text-sm break-all">
                {{ pk }}
                <span v-if="dongText(pk)" class="ml-1 font-sans text-xs text-muted-foreground">
                  {{ dongText(pk) }}
                </span>
              </span>
              <Button variant="ghost" size="sm" class="h-7 text-xs" @click="copy(pk)">복사</Button>
              <NuxtLink
                :to="{ path: '/tools', query: { path: INFO_PATH, mgmbldpk: pk, run: '1' } }"
                :class="buttonVariants({ variant: 'ghost', size: 'sm' })"
                class="h-7 text-xs"
              >
                대장 정보
              </NuxtLink>
            </li>
          </ul>
          <!-- 부속건축물 — 주건축물 목록과 구분되도록 배경이 깔린 박스 안에 토글·목록을 묶는다 -->
          <div v-if="subPks.length" class="mt-2 overflow-hidden rounded-md border bg-muted/40">
            <button
              type="button"
              class="flex w-full items-center gap-2 bg-muted px-3 py-2 text-sm font-medium transition-colors hover:bg-muted/80"
              :aria-expanded="subListOpen"
              @click="subListOpen = !subListOpen"
            >
              <span
                aria-hidden="true"
                class="inline-block text-xs text-muted-foreground transition-transform"
                :class="subListOpen ? 'rotate-90' : ''"
              >
                ▶
              </span>
              부속건축물 {{ subPks.length }}건
              <span class="font-normal text-muted-foreground">
                (주차장·경비실·주민공동시설 등)
              </span>
              <span class="ml-auto text-xs font-normal text-muted-foreground">
                {{ subListOpen ? '접기' : '펼치기' }}
              </span>
            </button>
            <ul v-if="subListOpen" class="divide-y border-t px-3">
              <li v-for="pk in subPks" :key="pk" class="flex items-center gap-2 py-1.5">
                <span class="flex-1 font-mono text-[13px] break-all text-muted-foreground">
                  {{ pk }}
                  <span v-if="dongText(pk)" class="ml-1 font-sans text-xs">
                    {{ dongText(pk) }}
                  </span>
                </span>
                <Button variant="ghost" size="sm" class="h-7 text-xs" @click="copy(pk)"
                  >복사</Button
                >
                <NuxtLink
                  :to="{ path: '/tools', query: { path: INFO_PATH, mgmbldpk: pk, run: '1' } }"
                  :class="buttonVariants({ variant: 'ghost', size: 'sm' })"
                  class="h-7 text-xs"
                >
                  대장 정보
                </NuxtLink>
              </li>
            </ul>
          </div>
        </div>

        <dl class="grid grid-cols-[7.5rem_1fr] gap-y-0 px-5 py-2 text-sm">
          <dt class="border-b py-2.5 text-muted-foreground">정제된 주소</dt>
          <dd class="border-b py-2.5">{{ success.cleanAddr || '—' }}</dd>
          <dt class="border-b py-2.5 text-muted-foreground">지번 주소</dt>
          <dd class="border-b py-2.5">{{ success.platAddr || '—' }}</dd>
          <dt class="border-b py-2.5 text-muted-foreground">법정동코드</dt>
          <dd class="border-b py-2.5 font-mono text-[13px]">{{ success.legalCode || '—' }}</dd>
          <dt class="py-2.5 text-muted-foreground">매칭 등급</dt>
          <dd class="py-2.5">
            <span v-if="success.grade" class="font-mono text-[13px]">
              {{ success.grade }}<template v-if="success.level"> · {{ success.level }}</template>
            </span>
            <template v-else>—</template>
          </dd>
        </dl>

        <div class="flex flex-wrap gap-2 border-t px-5 py-3.5">
          <NuxtLink
            v-if="!pkList.length && mainPk"
            :to="{ path: '/tools', query: { path: INFO_PATH, mgmbldpk: mainPk, run: '1' } }"
            :class="buttonVariants({ variant: 'outline', size: 'sm' })"
          >
            건축물대장 정보 보기
          </NuxtLink>
          <NuxtLink
            v-if="mainPk"
            :to="{
              path: '/tools',
              query: { path: CONVERT_PATH, mgm_bld_pk_new: mainPk, run: '1' },
            }"
            :class="buttonVariants({ variant: 'outline', size: 'sm' })"
          >
            기존 PK로 변환
          </NuxtLink>
          <NuxtLink
            :to="{ path: '/tools', query: { path: MATCH_PATH, input_addr: addr, run: '1' } }"
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
        class="mt-5 rounded-xl border border-destructive/30 bg-card p-5 shadow-sm"
      >
        <p class="text-sm font-semibold text-destructive">
          {{ networkError ? '서버에 연결하지 못했습니다' : '표준연계키를 생성하지 못했습니다' }}
        </p>
        <p class="mt-1.5 text-sm text-muted-foreground">
          {{ networkError || (parsed && !parsed.ok ? parsed.message : '') }}
        </p>
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
            class="h-7 text-xs"
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
            :to="{ path: '/tools', query: { path: MATCH_PATH, input_addr: addr } }"
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
        <Button variant="ghost" size="sm" class="h-7 text-xs" @click="history.clear()">
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
  </main>
</template>
