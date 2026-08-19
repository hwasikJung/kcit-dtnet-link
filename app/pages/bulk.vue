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
import { parseBulkSheet, pasteToAoa } from '~/lib/bulk-parse'
import { buildBulkSummary } from '~/lib/bulk-summary'
import { parseBulkHistoryFile, serializeBulkHistory } from '~/lib/history-io'
import { extractAddrMatchCols, extractRegionCandidates, type RegionCandidate } from '~/lib/keygen'
import {
  KEYGEN_COLUMNS,
  flattenKeygenResult,
  mergeAddrMatchCols,
  mergeStdLinkCols,
  parseAddrSheet,
} from '~/lib/keygen-bulk'
import { STD_LINK_COLUMNS, detectStdLinkParam, flattenStdLinkKey } from '~/lib/std-link-key'
import type { BulkHistoryMeta, BulkResultRecord, BulkRow } from '~/types/bulk'

const MAX_ROWS = 5000
const CONCURRENCY = 5

type BulkMode = 'keygen' | 'info'

/** 탭(처리 종류)별 문구·파서·컬럼 정의 — 흐름(업로드→실행→저장→다운로드)은 공유한다 */
const MODES: Record<
  BulkMode,
  {
    tab: string
    desc: string
    keyLabel: string
    hint: string
    runLabel: string
    columns: { key: string; label: string }[]
    statusLabels: Partial<Record<BulkRow['status'], string>>
    detailDesc: string
    sample: string[][]
    sampleName: string
    downloadSuffix: string
    parse: (aoa: unknown[][]) => { hadHeader: boolean; extraHeaders: string[]; rows: BulkRow[] }
    /** 행 1건 처리에 실제 호출되는 기능 경로 — 화면에 작게 표기 */
    apiPaths: string[]
  }
> = {
  info: {
    tab: 'PK기반 일괄처리',
    desc: '생성된 키를 활용하는 단계입니다. 엑셀 A열에 표준연계키(R_/T_/S_ 접두) 또는 건축물대장 PK(기존·신규)를 담아 업로드하면 표준연계키와 대장 PK·건물명·주소·PNU 등 연계 정보를 일괄 조회합니다.',
    keyLabel: '입력값',
    hint: 'A열 = 표준연계키 또는 대장 PK',
    runLabel: '일괄 조회',
    columns: STD_LINK_COLUMNS,
    statusLabels: { notfound: '미매칭' },
    detailDesc: '표준연계키 조회 상세',
    sample: [['표준연계키'], ['11680-12777'], ['1024112777'], ['R_11110-1']],
    sampleName: 'PK기반일괄조회_샘플.xlsx',
    downloadSuffix: '_조회결과.xlsx',
    parse: parseBulkSheet,
    apiPaths: ['/sqiapi/addr/std_link_key'],
  },
  keygen: {
    tab: '주소기반 일괄처리',
    desc: '건물 주소로 표준연계키를 만드는 단계입니다. 엑셀 A열에 주소를 담아 업로드하면 주소 정제·건축물대장 매칭을 거쳐 표준연계키를 일괄 생성하고, PK기반 조회와 동일한 연계 정보(표준연계키·신규 PK·건물명·주소·PNU)를 함께 제공합니다.',
    keyLabel: '주소',
    hint: 'A열 = 건물 주소',
    runLabel: '일괄 생성',
    columns: KEYGEN_COLUMNS,
    statusLabels: { notfound: '매칭 실패' },
    detailDesc: '표준연계키 생성 상세',
    // '대청로 119'는 여러 지역에 있어 일괄 처리에선 항상 실패 처리되므로 시·도까지 붙인 주소를 쓴다
    sample: [
      ['주소'],
      ['부산광역시 중구 대청로 119'],
      ['홍은동 455'],
      ['미사대로 510'],
      ['덕풍남로 11'],
    ],
    sampleName: '주소기반일괄생성_샘플.xlsx',
    downloadSuffix: '_키생성결과.xlsx',
    parse: parseAddrSheet,
    apiPaths: [
      '/sqiapi/addr/building_match_clean_union',
      '/sqiapi/addr/asis/juso',
      '/sqiapi/addr/std_link_key',
      '/sqiapi/addr/addr_match',
    ],
  },
}

const { toast } = useToast()
const history = useBulkHistory()

const mode = ref<BulkMode>('info')
const cfg = computed(() => MODES[mode.value])

const fileName = ref('')
const rows = ref<BulkRow[]>([])
const hadHeader = ref(false)
/** 업로드 원본 B열~ 헤더 — 결과 다운로드에서 원본 컬럼을 그대로 보존한다 */
const extraHeaders = ref<string[]>([])
const running = ref(false)
const finished = ref(false)
const progress = ref({ done: 0, total: 0 })

/** 실행 시작 시각 — 진행 속도로 남은 시간을 추정한다 */
const runStartedAt = ref(0)
const etaText = computed(() => {
  const { done, total } = progress.value
  // 표본이 적으면(5건 미만) 추정이 크게 흔들려 표시하지 않는다
  if (!running.value || !total || done < 5 || done >= total) return ''
  const remainMs = ((performance.now() - runStartedAt.value) / done) * (total - done)
  const sec = Math.round(remainMs / 1000)
  if (sec < 5) return '곧 완료됩니다'
  if (sec < 60) return `약 ${sec}초 남음`
  return `약 ${Math.ceil(sec / 60)}분 남음`
})

// 결과 테이블 상태 칩 필터 — 다운로드에도 같은 필터를 적용한다(라이브·이력 Modal 각각)
const statusFilter = ref<BulkRow['status'] | 'all'>('all')
const historyFilter = ref<BulkRow['status'] | 'all'>('all')
/** 상태 라벨 — 탭(처리 종류)별 재정의 반영 */
function statusLabelOf(kind: BulkMode, s: BulkRow['status']) {
  return {
    pending: '대기',
    success: '성공',
    notfound: '미존재',
    error: '실패',
    ...MODES[kind].statusLabels,
  }[s]
}
/** 필터 적용 다운로드 대상·파일명 — 필터가 걸려 있으면 해당 상태 행만, 파일명에 상태 라벨 표기 */
function filteredDownload(
  target: BulkRow[],
  baseName: string,
  kind: BulkMode,
  filter: BulkRow['status'] | 'all',
) {
  if (filter === 'all') return { rows: target, name: baseName }
  return {
    rows: target.filter((r) => r.status === filter),
    name: `${baseName.replace(/\.[^.]+$/, '')}_${statusLabelOf(kind, filter)}`,
  }
}
const liveDownload = computed(() =>
  filteredDownload(rows.value, fileName.value, mode.value, statusFilter.value),
)
const historyDownload = computed(() =>
  historyRecord.value
    ? filteredDownload(
        historyRecord.value.rows,
        historyRecord.value.fileName,
        kindOf(historyRecord.value),
        historyFilter.value,
      )
    : { rows: [], name: '' },
)

const detailRow = ref<BulkRow | null>(null)
const detailKind = ref<BulkMode>('keygen')
const detailOpen = ref(false)

const historyRecord = ref<BulkResultRecord | null>(null)
const historyOpen = ref(false)

onMounted(() => history.refresh())

function switchMode(next: BulkMode) {
  if (running.value || mode.value === next) return
  mode.value = next
  fileName.value = ''
  rows.value = []
  hadHeader.value = false
  extraHeaders.value = []
  finished.value = false
  progress.value = { done: 0, total: 0 }
  pasteOpen.value = false
  pasteText.value = ''
  colSelectOpen.value = false
  excludedCols.value = new Set()
  statusFilter.value = 'all'
}

const validCount = computed(() => rows.value.filter((r) => !r.invalid).length)
// 재시도 대상 = 처리 실패 + 매칭 실패(미존재) 행 (A열 빈값 등 입력 오류 행은 제외)
// — 매칭 실패도 서버 데이터 갱신·유사 주소 재조회 개선으로 결과가 달라질 수 있어 포함한다
const isRetryable = (r: BulkRow) =>
  (r.status === 'error' || r.status === 'notfound') && r.invalid !== 'empty'
const retryCount = computed(() => rows.value.filter(isRetryable).length)
const summary = computed(() => ({
  success: rows.value.filter((r) => r.status === 'success').length,
  notfound: rows.value.filter((r) => r.status === 'notfound').length,
  error: rows.value.filter((r) => r.status === 'error').length,
}))

// 처리 중 새로고침·탭 닫기·페이지 이동으로 진행분이 유실되는 것을 방지
function onBeforeUnload(e: BeforeUnloadEvent) {
  if (!running.value) return
  e.preventDefault()
  e.returnValue = ''
}
onMounted(() => window.addEventListener('beforeunload', onBeforeUnload))
onBeforeUnmount(() => window.removeEventListener('beforeunload', onBeforeUnload))
onBeforeRouteLeave(() => {
  if (!running.value) return true
  return window.confirm('일괄처리가 진행 중입니다. 페이지를 벗어나면 진행 중인 결과가 사라집니다.')
})

async function downloadSample() {
  const XLSX = await import('xlsx-js-style')
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(cfg.value.sample), '샘플')
  XLSX.writeFile(wb, cfg.value.sampleName)
}

async function onFileChange(ev: Event) {
  const input = ev.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  // 실행 중 새 파일을 적용하면 진행 중인 워커가 교체된 행 목록에 결과를 덮어써 데이터가 섞인다
  if (running.value || !file) return

  const XLSX = await import('xlsx-js-style')
  let aoa: unknown[][]
  try {
    const wb = XLSX.read(await file.arrayBuffer())
    const sheet = wb.Sheets[wb.SheetNames[0]!]
    aoa = sheet ? XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1 }) : []
  } catch {
    toast('파일을 읽지 못했습니다. xlsx/csv 형식인지 확인해 주세요.', 'error')
    return
  }

  applyParsed(aoa, file.name, '엑셀에서 데이터 행을 찾지 못했습니다.')
}

/** 파싱 결과를 화면 상태에 적용 — 파일 업로드·텍스트 붙여넣기 공용 */
function applyParsed(aoa: unknown[][], sourceName: string, emptyMsg: string) {
  const parsed = cfg.value.parse(aoa)

  if (parsed.rows.length > MAX_ROWS) {
    toast(
      `행이 너무 많습니다. 1회 최대 ${MAX_ROWS.toLocaleString()}행까지 처리할 수 있어요.`,
      'error',
    )
    return
  }

  hadHeader.value = parsed.hadHeader
  extraHeaders.value = parsed.extraHeaders
  rows.value = parsed.rows

  fileName.value = sourceName
  finished.value = false
  progress.value = { done: 0, total: 0 }

  if (!rows.value.length) toast(emptyMsg, 'error')
}

// 텍스트 붙여넣기 입력 — 파일 없이 줄 단위(엑셀 표 복사는 탭 구분 열 보존)로 목록을 만든다
const pasteOpen = ref(false)
const pasteText = ref('')
/** 붙여넣기 입력란 placeholder — 탭별 샘플 데이터 재사용 */
const pastePlaceholder = computed(() =>
  cfg.value.sample
    .slice(1)
    .map((r) => r[0])
    .join('\n'),
)

function loadPasted() {
  if (running.value || !pasteText.value.trim()) return
  applyParsed(
    pasteToAoa(pasteText.value),
    '붙여넣기 입력',
    '붙여넣은 텍스트에서 데이터 행을 찾지 못했습니다.',
  )
}

/** A열 값 1건 처리 — 모드에 따라 대장 정보 조회 또는 키 생성 호출 */
async function lookupOne(
  key: string,
): Promise<Pick<BulkRow, 'status' | 'cols' | 'raw' | 'errorMsg'>> {
  const apiBase = useRuntimeConfig().public.apiBase
  try {
    if (mode.value === 'keygen') {
      // 다지역 모호 감지용 주소검색을 병렬 호출 — 실패 시 감지만 생략(fail-open)
      const [raw, regions] = await Promise.all([
        $fetch(apiBase + '/sqiapi/addr/building_match_clean_union', {
          query: { input_addr: key },
        }),
        $fetch(apiBase + '/sqiapi/addr/asis/juso', {
          query: { input_addr: key },
          timeout: 5000,
        }).then(
          (d) => extractRegionCandidates(d),
          () => [] as RegionCandidate[],
        ),
      ])
      let flat = flattenKeygenResult(raw, regions)
      let effectiveRaw: unknown = raw
      // 유사 주소 자동 재조회 — 서버가 오류에 유사 주소를 알려준 케이스는 그 주소로 1회
      // 재시도하고, 성공하면 "유사 주소 매칭" 컬럼에 사용한 주소를 태그로 남긴다.
      // 재시도 실패 시 원래 실패 사유 유지(fail-open). 다지역 모호 행은 similarAddr가 없어 제외
      if (flat.status === 'notfound' && flat.similarAddr) {
        const retryRaw = await $fetch(apiBase + '/sqiapi/addr/building_match_clean_union', {
          query: { input_addr: flat.similarAddr },
          timeout: 5000,
        }).catch(() => null)
        if (retryRaw) {
          const retryFlat = flattenKeygenResult(retryRaw)
          if (retryFlat.status === 'success') {
            retryFlat.cols.similar_addr = flat.similarAddr
            flat = retryFlat
            effectiveRaw = retryRaw
          }
        }
      }
      // 매칭 실패 행 주소 정보 보강 — 대장 PK가 없어도 addr_match(주소매칭)로 도로명주소·
      // 지번주소·건물명·우편번호를 채운다(2026-08-19 실측: 실패 주소도 주소 정보는 반환).
      // 다지역 모호 행은 제외 — addr_match가 한 지역만 골라 주므로 채우면 오도. 실패 시 보강만 생략
      if (flat.status === 'notfound' && regions.length <= 1) {
        const addrCols = await $fetch(apiBase + '/sqiapi/addr/addr_match', {
          query: { input_addr: key },
          timeout: 5000,
        }).then(
          (d) => extractAddrMatchCols(d),
          () => ({}) as Record<string, string>,
        )
        mergeAddrMatchCols(flat.cols, addrCols)
      }
      // PK기반 탭과 동일한 표준연계키 조회 값을 함께 제공 — 대표 PK(총괄 첫 건, 없으면 첫
      // 표제부)로 std_link_key를 후속 조회해 병합한다. 총괄 PK가 비어 있으면 소속 총괄
      // (mgm_upper_bld_pk) 보강도 병합에서 함께 처리. 실패 시 병합만 생략(fail-open)
      if (flat.status === 'success') {
        const repPk = (flat.cols.upper_pk || flat.cols.pks || '').split(',')[0]!.trim()
        if (repPk) {
          const std = await $fetch(apiBase + '/sqiapi/addr/std_link_key', {
            query: { mgm_bld_pk: repPk },
            timeout: 5000,
          }).then(
            (d) => flattenStdLinkKey(d).cols,
            () => null,
          )
          // PK 조회는 해당 레코드 1건만 오므로(실측) 대표가 총괄이면 표제부 신규 PK가 비어 있다 —
          // 표준연계키로 그룹(총괄+표제부)을 1회 재조회해 대장종류별 신규 PK를 채운다. 실패 시 생략
          if (std && !std.title_pk_new && std.std_link_key) {
            const group = await $fetch(apiBase + '/sqiapi/addr/std_link_key', {
              query: { std_link_key: std.std_link_key },
              timeout: 5000,
            }).then(
              (d) => flattenStdLinkKey(d).cols,
              () => null,
            )
            if (group?.title_pk_new) {
              std.title_pk_new = group.title_pk_new
              if (group.recap_pk_new) std.recap_pk_new = group.recap_pk_new
            }
          }
          if (std) mergeStdLinkCols(flat.cols, std)
        }
      }
      return {
        raw: effectiveRaw,
        status: flat.status,
        cols: flat.cols,
        errorMsg: flat.errorMsg,
      }
    }
    // 입력 형식(표준연계키/기존 PK/신규 PK)에 맞는 쿼리 파라미터로 조회한다
    const raw = await $fetch(apiBase + '/sqiapi/addr/std_link_key', {
      query: { [detectStdLinkParam(key)]: key },
    })
    return { raw, ...flattenStdLinkKey(raw) }
  } catch (err) {
    const er = err as { data?: { message?: string } | null; message?: string }
    return {
      raw: null,
      status: 'error',
      cols: {},
      errorMsg: er?.data?.message ?? er?.message ?? '처리 중 오류가 발생했습니다.',
    }
  }
}

// 중단 요청 — 진행 중인 호출은 마치고 새 행을 꺼내지 않는다(처리분은 그대로 저장)
const cancelRequested = ref(false)

async function executeLookups(keys: string[]) {
  running.value = true
  cancelRequested.value = false
  progress.value = { done: 0, total: keys.length }
  runStartedAt.value = performance.now()

  async function lookup(key: string) {
    const result = await lookupOne(key)
    for (const row of rows.value) {
      if (row.pk === key && row.invalid !== 'empty') Object.assign(row, result)
    }
    progress.value.done++
  }

  // 동시 CONCURRENCY건 워커 풀 — 중단 검사를 큐에서 꺼내기 전에 해 꺼낸 키가 미처리로 버려지지 않게 한다
  const queue = [...keys]
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
      while (!cancelRequested.value) {
        const key = queue.shift()
        if (key == null) break
        await lookup(key)
      }
    }),
  )

  running.value = false
  finished.value = true
  if (cancelRequested.value)
    toast(`중단했습니다. 처리된 ${progress.value.done}건까지 저장·다운로드할 수 있습니다.`)
}

// 마지막 처리의 이력 id — 재시도 시 같은 id로 덮어써 이력이 중복 생성되지 않게 한다
const lastRecordId = ref('')

async function saveRecord() {
  // 재시도 저장이 같은 id를 덮어쓸 때 사용자가 붙인 이력 이름이 사라지지 않게 유지한다
  const prevLabel = (await history.get(lastRecordId.value))?.label
  const record: BulkResultRecord = {
    id: lastRecordId.value,
    fileName: fileName.value,
    createdAt: Date.now(),
    total: rows.value.length,
    ...summary.value,
    // 반응형 프록시 제거 — JSON 왕복보다 가벼운 구조적 클론 사용(최대 5,000행 + 원본 응답 포함)
    rows: structuredClone(toRaw(rows.value)),
    kind: mode.value,
    extraHeaders: [...extraHeaders.value],
    label: prevLabel,
  }
  try {
    await history.save(record)
    toast('처리 결과를 이력에 저장했습니다.')
  } catch {
    toast('결과 이력 저장에 실패했습니다. (브라우저 저장소 확인)', 'error')
  }
}

async function run() {
  if (running.value || !rows.value.length) return
  finished.value = false
  const keys = [...new Set(rows.value.filter((r) => !r.invalid).map((r) => r.pk))]
  lastRecordId.value = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  await executeLookups(keys)
  await saveRecord()
}

async function retryFailed() {
  if (running.value) return
  const keys = [...new Set(rows.value.filter(isRetryable).map((r) => r.pk))]
  if (!keys.length) return
  await executeLookups(keys)
  await saveRecord()
}

async function download(
  target: BulkRow[],
  baseName: string,
  kind: BulkMode,
  extras: string[],
  opts?: { columns?: { key: string; label: string }[]; processedAt?: number },
) {
  const XLSX = await import('xlsx-js-style')
  const c = MODES[kind]
  const columns = opts?.columns ?? c.columns
  const statusLabel = {
    pending: '대기',
    success: '성공',
    notfound: '미존재',
    error: '실패',
    ...c.statusLabels,
  }
  // 업로드 원본 컬럼(B열~)을 그대로 두고 결과 컬럼을 뒤에 붙인다 — 받은 파일에서 후처리 없이 사용
  const aoa = [
    [c.keyLabel, ...extras, ...columns.map((col) => col.label), '상태'],
    ...target.map((r) => [
      r.pk,
      ...extras.map((_, i) => r.extra?.[i] ?? ''),
      ...columns.map((col) => r.cols[col.key] ?? ''),
      statusLabel[r.status],
    ]),
  ]
  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.aoa_to_sheet(aoa)
  // 실패·미매칭 행의 상태 셀 색상 — 받은 파일에서 문제 행을 바로 구분 (엑셀 '나쁨' 스타일 색)
  const statusCol = aoa[0]!.length - 1
  const failStyle = {
    fill: { fgColor: { rgb: 'FFC7CE' } },
    font: { color: { rgb: '9C0006' } },
  }
  target.forEach((r, i) => {
    if (r.status !== 'error' && r.status !== 'notfound') return
    const cell = ws[XLSX.utils.encode_cell({ r: i + 1, c: statusCol })]
    if (cell) cell.s = failStyle
  })
  XLSX.utils.book_append_sheet(wb, ws, '결과')
  // 상태 집계·실패 사유 분포 요약 시트 — 보고용으로 결과 파일 하나면 되도록 동봉
  const summaryAoa = buildBulkSummary(target, statusLabel, {
    fileName: baseName,
    processedAt: formatDate(opts?.processedAt ?? Date.now()),
  })
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summaryAoa), '요약')
  XLSX.writeFile(wb, `${baseName.replace(/\.[^.]+$/, '')}${c.downloadSuffix}`)
}

// 다운로드 컬럼 선택 — 결과 컬럼만 선택 대상(A열·원본 열·상태는 항상 포함)
const colSelectOpen = ref(false)
const excludedCols = ref<Set<string>>(new Set())
/** 체크 토글 — Set 재할당으로 반응성 유지 */
function toggleCol(key: string) {
  const next = new Set(excludedCols.value)
  if (next.has(key)) next.delete(key)
  else next.add(key)
  excludedCols.value = next
}
const downloadColumns = computed(() =>
  cfg.value.columns.filter((c) => !excludedCols.value.has(c.key)),
)

function openDetail(row: BulkRow, kind: BulkMode) {
  detailRow.value = row
  detailKind.value = kind
  detailOpen.value = true
}

async function openHistory(meta: BulkHistoryMeta) {
  const record = await history.get(meta.id)
  if (!record) {
    toast('이력을 불러오지 못했습니다.', 'error')
    return
  }
  historyRecord.value = record
  historyFilter.value = 'all'
  historyOpen.value = true
}

/** 이력에 이름 붙이기 — 파일명·시각만으로 구분하기 어려운 이력에 메모용 이름을 단다 */
async function renameHistory(meta: BulkHistoryMeta) {
  const input = window.prompt(
    '이력에 표시할 이름을 입력하세요. (비우면 이름 제거)',
    meta.label ?? '',
  )
  if (input === null) return
  const record = await history.get(meta.id)
  if (!record) {
    toast('이력을 불러오지 못했습니다.', 'error')
    return
  }
  record.label = input.trim() || undefined
  try {
    await history.save(record)
  } catch {
    toast('이력 저장에 실패했습니다. (브라우저 저장소 확인)', 'error')
  }
}

async function removeHistory(meta: BulkHistoryMeta) {
  // 원본 응답까지 담긴 이력이라 복구할 수 없다 — 삭제 전 확인
  if (!window.confirm(`'${meta.fileName}' 이력을 삭제할까요? 삭제하면 되돌릴 수 없습니다.`)) return
  try {
    await history.remove(meta.id)
    toast('이력을 삭제했습니다.')
  } catch {
    toast('이력 삭제에 실패했습니다. (브라우저 저장소 확인)', 'error')
  }
}

async function clearHistory() {
  const count = history.items.value.length
  // 원본 응답까지 담긴 이력이라 복구할 수 없다 — 삭제 전 확인
  if (!window.confirm(`저장된 이력 ${count}건을 모두 삭제할까요? 삭제하면 되돌릴 수 없습니다.`))
    return
  try {
    await history.clear()
    toast('이력을 모두 삭제했습니다.')
  } catch {
    toast('이력 삭제에 실패했습니다. (브라우저 저장소 확인)', 'error')
  }
}

/** 이력 레코드의 처리 종류 — kind 없는 과거 레코드는 대장 정보 조회 */
const kindOf = (r: { kind?: BulkMode }) => r.kind ?? 'info'

// 이력 내보내기/가져오기 — 브라우저(IndexedDB)에만 있는 이력을 JSON 파일로 옮긴다(PC 교체·공유용)
async function exportHistory() {
  const records: BulkResultRecord[] = []
  for (const meta of history.items.value) {
    const r = await history.get(meta.id)
    if (r) records.push(r)
  }
  if (!records.length) return
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}`
  const blob = new Blob([serializeBulkHistory(records, now.getTime())], {
    type: 'application/json',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `일괄처리이력_${stamp}.json`
  a.click()
  URL.revokeObjectURL(url)
  toast(`이력 ${records.length}건을 파일로 내보냈습니다.`)
}

async function onImportHistory(ev: Event) {
  const input = ev.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  let parsed: ReturnType<typeof parseBulkHistoryFile>
  try {
    parsed = parseBulkHistoryFile(await file.text())
  } catch (e) {
    toast((e as Error).message, 'error')
    return
  }
  if (!parsed.records.length) {
    toast('파일에 가져올 이력이 없습니다.', 'error')
    return
  }
  const existing = new Set(history.items.value.map((i) => i.id))
  let added = 0
  let dup = 0
  let saveFailed = false
  // 오래된 것부터 저장 — 보관 한도(최근 20건) 초과 시 최신 이력이 남도록
  for (const r of [...parsed.records].sort((a, b) => a.createdAt - b.createdAt)) {
    if (existing.has(r.id)) {
      dup++
      continue
    }
    try {
      await history.save(r)
      added++
    } catch {
      saveFailed = true
      break
    }
  }
  const parts = [`이력 ${added}건을 가져왔습니다.`]
  if (dup) parts.push(`이미 있는 ${dup}건 제외.`)
  if (parsed.skipped) parts.push(`형식 오류 ${parsed.skipped}건 제외.`)
  if (saveFailed) parts.push('저장 실패로 중단했습니다. (브라우저 저장소 확인)')
  toast(parts.join(' '), saveFailed ? 'error' : undefined)
}

function formatDate(ts: number) {
  const d = new Date(ts)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}
</script>

<template>
  <main class="mx-auto w-full max-w-screen-2xl px-6 py-8">
    <h1 class="text-xl font-semibold tracking-tight">표준연계키 일괄처리</h1>

    <!-- 처리 종류 탭 -->
    <div class="mt-4 flex gap-1 rounded-lg bg-secondary p-1 sm:w-fit" role="tablist">
      <button
        v-for="(m, key) in MODES"
        :key="key"
        role="tab"
        :aria-selected="mode === key"
        class="flex-1 rounded-md px-4 py-1.5 text-sm transition-colors sm:flex-none"
        :class="
          mode === key
            ? 'bg-card font-medium shadow-sm'
            : 'text-muted-foreground hover:text-foreground'
        "
        :disabled="running"
        @click="switchMode(key)"
      >
        {{ m.tab }}
      </button>
    </div>

    <p class="mt-3 text-sm text-muted-foreground">
      {{ cfg.desc }} 결과는 이 브라우저의 이력에 저장됩니다.
    </p>
    <ApiUsageNote class="mt-1" :paths="cfg.apiPaths" />

    <!-- 표준연계키 접두(R_/T_/S_) 도움말 — 두 탭 모두 결과에 키가 표시되므로 항상 제공 -->
    <details class="mt-2">
      <summary class="cursor-pointer text-xs text-muted-foreground select-none">
        표준연계키 형식(R_/T_/S_) 안내
      </summary>
      <div class="mt-2 max-w-2xl rounded-md border bg-card p-3">
        <StdKeyLegend />
      </div>
    </details>

    <!-- 업로드 -->
    <section class="mt-4 rounded-lg border p-4">
      <div class="flex flex-wrap items-center gap-3">
        <label
          for="bulk-file"
          class="inline-flex h-9 cursor-pointer items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
          :class="running ? 'pointer-events-none opacity-50' : ''"
        >
          엑셀 파일 선택
        </label>
        <input
          id="bulk-file"
          type="file"
          accept=".xlsx,.xls,.csv"
          class="sr-only"
          aria-label="일괄처리용 엑셀 파일"
          :disabled="running"
          @change="onFileChange"
        />
        <Button variant="outline" @click="downloadSample">샘플 파일 받기</Button>
        <Button variant="outline" :disabled="running" @click="pasteOpen = !pasteOpen">
          텍스트 붙여넣기
        </Button>
        <span v-if="fileName" class="text-sm">{{ fileName }}</span>
        <span class="text-xs text-muted-foreground">
          {{ cfg.hint }} · 1행 헤더 자동 감지 · 최대 {{ MAX_ROWS.toLocaleString() }}행 · B열~ 원본
          열 유지, 결과 컬럼은 그 뒤에 추가
        </span>
      </div>

      <!-- 텍스트 붙여넣기 — 파일 없이 줄 단위 입력, 엑셀 표 복사(탭 구분)도 열 그대로 보존 -->
      <div v-if="pasteOpen" class="mt-4 border-t pt-4">
        <label for="bulk-paste" class="text-sm font-medium">텍스트로 붙여넣기</label>
        <p class="mt-0.5 text-xs text-muted-foreground">
          {{ cfg.keyLabel }} 목록을 한 줄에 하나씩 입력하세요. 엑셀에서 복사한 표(여러 열)도 그대로
          붙여넣을 수 있습니다(첫 열 = {{ cfg.keyLabel }}).
        </p>
        <textarea
          id="bulk-paste"
          v-model="pasteText"
          rows="8"
          class="mt-2 w-full resize-y rounded-md border bg-transparent px-3 py-2 font-mono text-sm placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
          :placeholder="pastePlaceholder"
          :disabled="running"
        />
        <div class="mt-2 flex gap-2">
          <Button :disabled="running || !pasteText.trim()" @click="loadPasted"
            >목록 불러오기</Button
          >
          <Button variant="ghost" @click="pasteOpen = false">닫기</Button>
        </div>
      </div>

      <div v-if="rows.length" class="mt-4 flex flex-wrap items-center gap-3">
        <Button :disabled="running || !validCount" @click="run">
          <span
            v-if="running"
            class="mr-2 size-3.5 animate-spin rounded-full border-2 border-primary-foreground/40 border-t-primary-foreground"
          />
          {{
            running
              ? `처리 중 ${progress.done} / ${progress.total}`
              : `${cfg.runLabel} 실행 (${validCount}건)`
          }}
        </Button>
        <Button
          v-if="running"
          variant="outline"
          :disabled="cancelRequested"
          @click="cancelRequested = true"
        >
          {{ cancelRequested ? '중단 중…' : '중단' }}
        </Button>
        <Button v-if="finished && retryCount" variant="outline" @click="retryFailed">
          실패·{{ cfg.statusLabels.notfound ?? '미존재' }} {{ retryCount }}건 재시도
        </Button>
        <Button
          v-if="finished"
          variant="outline"
          :disabled="!liveDownload.rows.length"
          @click="
            download(liveDownload.rows, liveDownload.name, mode, extraHeaders, {
              columns: downloadColumns,
            })
          "
        >
          결과 엑셀 다운로드
          <template v-if="statusFilter !== 'all'">
            ({{ statusLabelOf(mode, statusFilter) }} {{ liveDownload.rows.length }}건)
          </template>
        </Button>
        <Button
          v-if="finished"
          variant="ghost"
          :aria-expanded="colSelectOpen"
          @click="colSelectOpen = !colSelectOpen"
        >
          컬럼 선택
          <template v-if="excludedCols.size">
            ({{ downloadColumns.length }}/{{ cfg.columns.length }})
          </template>
        </Button>
        <span class="text-xs text-muted-foreground">
          총 {{ rows.length }}행<template v-if="hadHeader"> (헤더 1행 제외)</template>
          <template v-if="finished">
            · <span class="text-success">성공 {{ summary.success }}</span> ·
            {{ cfg.statusLabels.notfound ?? '미존재' }} {{ summary.notfound }} ·
            <span class="text-destructive">실패 {{ summary.error }}</span>
          </template>
        </span>
      </div>

      <!-- 다운로드 컬럼 선택 — 결과 엑셀에 담을 조회 컬럼만 고른다 -->
      <div v-if="finished && colSelectOpen" class="mt-3 rounded-md border p-3">
        <p class="text-xs text-muted-foreground">
          결과 엑셀에 포함할 컬럼을 선택하세요. A열({{ cfg.keyLabel }})·원본 열·상태·요약 시트는
          항상 포함됩니다.
        </p>
        <div class="mt-2 flex flex-wrap gap-x-4 gap-y-1.5">
          <label
            v-for="col in cfg.columns"
            :key="col.key"
            class="flex cursor-pointer items-center gap-1.5 text-sm"
          >
            <input
              type="checkbox"
              class="accent-primary"
              :checked="!excludedCols.has(col.key)"
              @change="toggleCol(col.key)"
            />
            {{ col.label }}
          </label>
        </div>
        <Button
          v-if="excludedCols.size"
          variant="ghost"
          size="sm"
          class="mt-2 h-7 text-xs"
          @click="excludedCols = new Set()"
        >
          전체 선택
        </Button>
      </div>

      <!-- 진행률 바 + 남은 시간 추정 -->
      <div v-if="running && progress.total" class="mt-3">
        <div class="h-1.5 overflow-hidden rounded-full bg-muted">
          <div
            class="h-full rounded-full bg-primary transition-all"
            :style="{ width: `${Math.round((progress.done / progress.total) * 100)}%` }"
          />
        </div>
        <p v-if="etaText" class="mt-1 text-right text-xs text-muted-foreground">{{ etaText }}</p>
      </div>
    </section>

    <!-- 결과 테이블 -->
    <section v-if="rows.length" class="mt-6">
      <h2 class="mb-3 text-sm font-medium text-muted-foreground">
        {{ finished ? '처리 결과 (행 클릭 시 상세)' : '업로드된 A열 목록' }}
      </h2>
      <BulkResultDashboard
        v-if="finished"
        class="mb-4"
        :rows="rows"
        :status-labels="cfg.statusLabels"
        :key-label="cfg.keyLabel"
        @row-click="(row) => openDetail(row, mode)"
      />
      <BulkResultTable
        v-model:status-filter="statusFilter"
        :rows="rows"
        :columns="cfg.columns"
        :key-label="cfg.keyLabel"
        :status-labels="cfg.statusLabels"
        @row-click="(row) => openDetail(row, mode)"
      />
    </section>

    <!-- 저장된 이력 -->
    <section class="mt-10">
      <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 class="text-sm font-medium text-muted-foreground">
          저장된 처리 이력 (클릭 시 결과 보기)
        </h2>
        <div class="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            :disabled="!history.items.value.length"
            @click="exportHistory"
          >
            이력 내보내기
          </Button>
          <label
            for="history-import"
            :class="buttonVariants({ variant: 'outline', size: 'sm' })"
            class="cursor-pointer"
          >
            이력 가져오기
          </label>
          <input
            id="history-import"
            type="file"
            accept=".json,application/json"
            class="sr-only"
            aria-label="이력 파일 가져오기"
            @change="onImportHistory"
          />
          <Button
            variant="outline"
            size="sm"
            class="text-destructive hover:bg-destructive/10 hover:text-destructive"
            :disabled="!history.items.value.length"
            @click="clearHistory"
          >
            전체 삭제
          </Button>
        </div>
      </div>
      <p
        v-if="!history.items.value.length"
        class="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground"
      >
        저장된 이력이 없습니다. 일괄처리를 실행하면 자동으로 저장됩니다.
      </p>
      <ul v-else class="divide-y rounded-lg border">
        <li
          v-for="item in history.items.value"
          :key="item.id"
          tabindex="0"
          class="flex cursor-pointer items-center gap-3 px-4 py-3 transition-colors hover:bg-primary/5 focus-visible:bg-primary/5 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
          @click="openHistory(item)"
          @keydown.enter.prevent="openHistory(item)"
          @keydown.space.prevent="openHistory(item)"
        >
          <div class="min-w-0 flex-1">
            <p class="flex items-center gap-2 truncate text-sm font-medium">
              <Badge variant="outline" class="shrink-0 text-[11px]">
                {{ MODES[kindOf(item)].tab }}
              </Badge>
              <span class="truncate">{{ item.label || item.fileName }}</span>
            </p>
            <p class="mt-0.5 text-xs text-muted-foreground">
              {{ formatDate(item.createdAt) }} · 총 {{ item.total }}행<template v-if="item.label">
                · {{ item.fileName }}</template
              >
            </p>
          </div>
          <Badge class="border-transparent bg-success text-success-foreground text-[11px]"
            >성공 {{ item.success }}</Badge
          >
          <Badge variant="outline" class="text-[11px]">
            {{ MODES[kindOf(item)].statusLabels.notfound ?? '미존재' }} {{ item.notfound }}
          </Badge>
          <Badge class="border-transparent bg-destructive text-white text-[11px]"
            >실패 {{ item.error }}</Badge
          >
          <Button variant="ghost" size="sm" class="shrink-0" @click.stop="renameHistory(item)">
            이름
          </Button>
          <Button
            variant="ghost"
            size="sm"
            class="shrink-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
            @click.stop="removeHistory(item)"
          >
            삭제
          </Button>
        </li>
      </ul>
    </section>

    <!-- 이력 결과 Modal -->
    <Dialog v-model:open="historyOpen">
      <DialogScrollContent class="max-w-6xl">
        <DialogHeader>
          <DialogTitle>{{ historyRecord?.label || historyRecord?.fileName }}</DialogTitle>
          <DialogDescription>
            <template v-if="historyRecord">
              <template v-if="historyRecord.label">{{ historyRecord.fileName }} · </template>
              {{ MODES[kindOf(historyRecord)].tab }} · {{ formatDate(historyRecord.createdAt) }} ·
              총 {{ historyRecord.total }}행 · 성공 {{ historyRecord.success }} ·
              {{ MODES[kindOf(historyRecord)].statusLabels.notfound ?? '미존재' }}
              {{ historyRecord.notfound }} · 실패 {{ historyRecord.error }}
            </template>
          </DialogDescription>
        </DialogHeader>
        <div class="flex justify-end">
          <Button
            v-if="historyRecord"
            variant="outline"
            size="sm"
            :disabled="!historyDownload.rows.length"
            @click="
              download(
                historyDownload.rows,
                historyDownload.name,
                kindOf(historyRecord),
                historyRecord.extraHeaders ?? [],
                { processedAt: historyRecord.createdAt },
              )
            "
          >
            결과 엑셀 다운로드
            <template v-if="historyFilter !== 'all'">
              ({{ statusLabelOf(kindOf(historyRecord), historyFilter) }}
              {{ historyDownload.rows.length }}건)
            </template>
          </Button>
        </div>
        <BulkResultDashboard
          v-if="historyRecord"
          :rows="historyRecord.rows"
          :status-labels="MODES[kindOf(historyRecord)].statusLabels"
          :key-label="MODES[kindOf(historyRecord)].keyLabel"
          @row-click="(row) => openDetail(row, kindOf(historyRecord!))"
        />
        <BulkResultTable
          v-if="historyRecord"
          v-model:status-filter="historyFilter"
          :rows="historyRecord.rows"
          :columns="MODES[kindOf(historyRecord)].columns"
          :key-label="MODES[kindOf(historyRecord)].keyLabel"
          :status-labels="MODES[kindOf(historyRecord)].statusLabels"
          @row-click="(row) => openDetail(row, kindOf(historyRecord!))"
        />
      </DialogScrollContent>
    </Dialog>

    <!-- 행 상세 Modal -->
    <BulkRowDetailDialog
      v-model:open="detailOpen"
      :row="detailRow"
      :columns="MODES[detailKind].columns"
      :description="MODES[detailKind].detailDesc"
      :status-labels="MODES[detailKind].statusLabels"
    />
  </main>
</template>
