<script setup lang="ts">
import { Badge } from '@/components/ui/badge'
import { Button, buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { extractDongNm, parseKeygenResponse, type KeygenParse } from '~/lib/keygen'

/** 단건 생성에 사용하는 대표 기능 — 주소정제 후 건축물대장번호 매칭 (3차년도) */
const MATCH_PATH = '/sqiapi/addr/building_match_clean_union'
/** 키 카드에서 건축물대장 정보로 이어지는 기능 */
const INFO_PATH = '/sqiapi/addr/mgm_bld_pk_info/{mgmbldpk}'
/** 키 카드에서 신규 PK → 기존 PK 변환으로 이어지는 기능 */
const CONVERT_PATH = '/sqiapi/addr/convert_mgm_bld_pk_new_to_old'

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
/** 대표 키 — 총괄표제부 PK 우선, 없으면 첫 표제부 PK */
const mainPk = computed(() => success.value?.upperPk || success.value?.pks[0] || '')
const mainPkLabel = computed(() => (success.value?.upperPk ? '총괄표제부 PK' : '표제부 PK'))
/** 표제부 PK 전체 목록 — 총괄 PK가 있거나 2건 이상일 때만 별도 목록으로 노출 */
const pkList = computed(() => {
  const r = success.value
  if (!r) return []
  return r.upperPk || r.pks.length > 1 ? r.pks : []
})

// 표제부 PK별 동 이름 — 건당 추가 호출이 필요해 버튼 클릭 시에만(온디맨드) 조회한다
const dongNames = ref<Record<string, string>>({})
const dongLoading = ref(false)
const dongLoaded = ref(false)

async function loadDongNames() {
  const pks = pkList.value
  if (!pks.length || dongLoading.value) return
  dongLoading.value = true
  const apiBase = useRuntimeConfig().public.apiBase
  const queue = [...pks]
  await Promise.all(
    Array.from({ length: Math.min(5, queue.length) }, async () => {
      for (let pk = queue.shift(); pk != null; pk = queue.shift()) {
        try {
          const raw = await $fetch(
            apiBase + '/sqiapi/addr/mgm_bld_pk_info/' + encodeURIComponent(pk),
          )
          dongNames.value[pk] = extractDongNm(raw) || '-'
        } catch {
          dongNames.value[pk] = '-'
        }
      }
    }),
  )
  dongLoading.value = false
  dongLoaded.value = true
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
  dongNames.value = {}
  dongLoading.value = false
  dongLoaded.value = false
  router.replace({ query: { addr: address } })

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const delay = (ms: number) => new Promise((r) => setTimeout(r, reduced ? 0 : ms))

  const url = useRuntimeConfig().public.apiBase + MATCH_PATH
  const startedAt = performance.now()
  const fetchP = $fetch(url, { query: { input_addr: address } }).then(
    (data) => ({ ok: true as const, data }),
    (err: { data?: unknown; message?: string }) => ({ ok: false as const, err }),
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
  if (!p.ok) {
    stepStates.value = ['done', 'failed', 'idle']
    parsed.value = p
    history.add({ addr: address, upperPk: '', pks: [], ok: false })
  } else {
    stepStates.value = ['done', 'done', 'running']
    await delay(STEP_DELAY)
    stepStates.value = ['done', 'done', 'done']
    parsed.value = p
    history.add({ addr: address, upperPk: p.result.upperPk, pks: p.result.pks, ok: true })
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
            <span class="font-mono text-2xl font-semibold break-all sm:text-3xl">{{ mainPk }}</span>
            <Button variant="outline" size="sm" @click="copy(mainPk)">복사</Button>
            <Button variant="outline" size="sm" @click="copySummary()">요약 복사</Button>
            <Button variant="outline" size="sm" @click="copyLink()">링크 복사</Button>
          </div>
          <p class="mt-1 text-xs text-muted-foreground">{{ mainPkLabel }}</p>
        </div>

        <!-- 표제부 PK 목록 (총괄 PK가 있거나 여러 건일 때) -->
        <div v-if="pkList.length" class="border-b px-5 py-3">
          <div class="flex items-center justify-between">
            <p class="text-xs font-medium text-muted-foreground">표제부 PK {{ pkList.length }}건</p>
            <Button
              v-if="!dongLoaded"
              variant="ghost"
              size="sm"
              class="h-7 text-xs"
              :disabled="dongLoading"
              @click="loadDongNames()"
            >
              {{ dongLoading ? '불러오는 중…' : '동 이름 불러오기' }}
            </Button>
          </div>
          <ul class="mt-1.5 divide-y">
            <li v-for="pk in pkList" :key="pk" class="flex items-center gap-2 py-1.5">
              <span class="flex-1 font-mono text-sm break-all">
                {{ pk }}
                <span v-if="dongNames[pk]" class="ml-1 font-sans text-xs text-muted-foreground">
                  {{ dongNames[pk] }}
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
            :to="{ path: '/tools', query: { path: CONVERT_PATH, mgm_bld_pk_new: mainPk, run: '1' } }"
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
        <ul v-if="!networkError" class="mt-3 list-disc pl-5 text-xs leading-relaxed text-muted-foreground">
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
