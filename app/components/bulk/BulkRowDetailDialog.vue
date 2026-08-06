<script setup lang="ts">
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogDescription,
  DialogHeader,
  DialogScrollContent,
  DialogTitle,
} from '@/components/ui/dialog'
import { BULK_COLUMNS, flattenBldInfo } from '~/lib/bulk-columns'
import { extractRecapGroup, extractTitleRecords, type StdLinkTitleItem } from '~/lib/std-link-key'
import type { BulkRow } from '~/types/bulk'

const props = withDefaults(
  defineProps<{
    row: BulkRow | null
    /** 상세 표의 표시 컬럼 — 기본은 대장 정보 조회 컬럼 */
    columns?: { key: string; label: string }[]
    description?: string
    /** 상태 라벨 재정의 (예: 키 생성에서는 notfound=매칭 실패) */
    statusLabels?: Partial<Record<BulkRow['status'], string>>
  }>(),
  { columns: () => BULK_COLUMNS, description: '건물 정보 상세', statusLabels: () => ({}) },
)
const open = defineModel<boolean>('open', { required: true })

const STATUS_LABEL = computed<Record<BulkRow['status'], string>>(() => ({
  pending: '대기',
  success: '성공',
  notfound: '미존재',
  error: '실패',
  ...props.statusLabels,
}))

// 소속 표제부 목록 — 행이 총괄표제부(std_link_key 응답에 R 레코드)면 섹션을 노출하고,
// 섹션을 펼칠 때만 조회한다(지연 로드). 원본 응답에 표제부가 이미 있으면(표준연계키로
// 조회한 그룹 응답) 추가 호출 없이 그대로 쓴다.
const recapGroup = computed(() =>
  props.row?.status === 'success' ? extractRecapGroup(props.row.raw) : null,
)
const titles = ref<StdLinkTitleItem[]>([])
const titlesLoaded = ref(false)
const titlesLoading = ref(false)
const titlesError = ref(false)

watch(
  () => props.row,
  () => {
    titles.value = []
    titlesLoaded.value = false
    titlesLoading.value = false
    titlesError.value = false
  },
)

async function loadTitles() {
  const group = recapGroup.value
  if (!group || titlesLoaded.value || titlesLoading.value) return

  const inRaw = extractTitleRecords(props.row?.raw)
  if (inRaw.length) {
    // 그룹 응답이 이미 있는 경우 — 조회한 표준연계키 전체의 표제부를 그대로 표시
    titles.value = inRaw
    titlesLoaded.value = true
    return
  }
  if (!group.titleCnt) {
    titlesLoaded.value = true
    return
  }
  // PK로 조회한 단건 응답 — 그룹을 재조회하고, 보고 있는 총괄 소속의 표제부만 남긴다
  titlesLoading.value = true
  titlesError.value = false
  try {
    const data = await $fetch(useRuntimeConfig().public.apiBase + '/sqiapi/addr/std_link_key', {
      query: { std_link_key: group.stdLinkKey },
      timeout: 10000,
    })
    titles.value = extractTitleRecords(data, group.recapPk)
    titlesLoaded.value = true
  } catch {
    titlesError.value = true
  } finally {
    titlesLoading.value = false
  }
}

function onTitlesToggle(e: Event) {
  if ((e.target as HTMLDetailsElement).open) loadTitles()
}

// 표제부 행 클릭 시 인라인 확장 — 기존 PK로 대장 정보(mgm_bld_pk_info)를 지연 조회.
// 메뉴1 대장 정보 모달과 같은 API·컬럼(bulk-columns)을 재사용하고, 조회 결과는 PK별 캐시
const expandedPk = ref<string | null>(null)
const infoCache = ref<
  Record<string, { loading: boolean; errorMsg: string; cols: Record<string, string> | null }>
>({})

watch(
  () => props.row,
  () => {
    expandedPk.value = null
    infoCache.value = {}
  },
)

async function toggleTitleInfo(pk: string) {
  if (expandedPk.value === pk) {
    expandedPk.value = null
    return
  }
  expandedPk.value = pk
  const cached = infoCache.value[pk]
  // 성공 캐시·조회 중이면 재호출 없음 — 실패 항목은 다시 클릭할 때 재시도
  if (cached && (cached.loading || cached.cols)) return
  infoCache.value[pk] = { loading: true, errorMsg: '', cols: null }
  const entry = infoCache.value[pk]!
  try {
    const data = await $fetch(
      useRuntimeConfig().public.apiBase + '/sqiapi/addr/mgm_bld_pk_info/' + encodeURIComponent(pk),
      { timeout: 10000 },
    )
    if (data && typeof data === 'object' && 'error' in data) {
      entry.errorMsg = '해당 PK로 대장 정보를 찾지 못했습니다.'
    } else {
      entry.cols = flattenBldInfo(data)
    }
  } catch {
    entry.errorMsg = '대장 정보 조회에 실패했습니다. 행을 다시 클릭하면 재시도합니다.'
  } finally {
    entry.loading = false
  }
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogScrollContent class="max-w-3xl">
      <DialogHeader>
        <DialogTitle class="flex items-center gap-2">
          <span class="font-mono text-base">{{ row?.pk }}</span>
          <Badge
            v-if="row"
            :class="
              row.status === 'success'
                ? 'bg-success text-success-foreground border-transparent'
                : row.status === 'notfound'
                  ? 'bg-secondary text-secondary-foreground border'
                  : 'bg-destructive text-white border-transparent'
            "
            class="text-[11px]"
          >
            {{ STATUS_LABEL[row.status] }}
          </Badge>
        </DialogTitle>
        <DialogDescription>{{ description }}</DialogDescription>
      </DialogHeader>

      <template v-if="row">
        <!-- 처리 실패(status=error)의 원문 오류는 기술 문자열일 수 있어 접어서 제공.
             입력 오류(invalid)·미존재 안내는 우리가 만든 평이한 문구라 그대로 노출 -->
        <template v-if="row.errorMsg">
          <p v-if="row.status !== 'error' || row.invalid" class="text-sm text-destructive">
            {{ row.errorMsg }}
          </p>
          <div v-else>
            <p class="text-sm text-destructive">
              처리 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.
            </p>
            <details class="mt-1">
              <summary class="cursor-pointer text-xs text-muted-foreground select-none">
                오류 원문 보기
              </summary>
              <p class="mt-1 rounded-md bg-secondary px-3 py-2 font-mono text-xs break-all">
                {{ row.errorMsg }}
              </p>
            </details>
          </div>
        </template>

        <div v-if="row.status === 'success'" class="overflow-hidden rounded-lg border">
          <table class="w-full text-sm">
            <tbody>
              <tr v-for="c in columns" :key="c.key" class="border-b last:border-b-0">
                <th
                  class="w-36 bg-muted/40 px-3 py-2 text-left text-xs font-medium text-muted-foreground"
                >
                  {{ c.label }}
                </th>
                <td class="px-3 py-2 break-all">{{ row.cols[c.key] }}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- 소속 표제부 목록 — 총괄표제부 행에서만, 펼칠 때 지연 조회 -->
        <details v-if="recapGroup" class="rounded-lg border p-3" @toggle="onTitlesToggle">
          <summary class="cursor-pointer select-none text-sm font-medium">
            소속 표제부 {{ titlesLoaded ? `${titles.length}건` : '목록 보기' }}
            <span v-if="titlesLoaded && titles.length" class="font-normal text-muted-foreground">
              (행 클릭 시 대장 정보)
            </span>
          </summary>
          <div class="mt-2">
            <p v-if="titlesLoading" class="text-sm text-muted-foreground">
              소속 표제부를 조회하는 중…
            </p>
            <p v-else-if="titlesError" class="text-sm text-destructive">
              소속 표제부 조회에 실패했습니다.
              <button class="underline underline-offset-2" @click="loadTitles">다시 시도</button>
            </p>
            <p v-else-if="titlesLoaded && !titles.length" class="text-sm text-muted-foreground">
              이 총괄표제부에 묶인 표제부가 없습니다.
            </p>
            <div v-else-if="titles.length" class="max-h-[40vh] overflow-auto rounded-md border">
              <table class="w-full text-sm">
                <thead>
                  <tr class="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                    <th class="px-3 py-2 font-medium">건물명</th>
                    <th class="px-3 py-2 font-medium">기존 PK</th>
                    <th class="px-3 py-2 font-medium">신규 PK</th>
                  </tr>
                </thead>
                <tbody>
                  <template v-for="t in titles" :key="t.mgmBldPk">
                    <tr
                      tabindex="0"
                      role="button"
                      :aria-expanded="expandedPk === t.mgmBldPk"
                      class="cursor-pointer border-b transition-colors last:border-b-0 hover:bg-primary/5 focus-visible:bg-primary/5 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
                      @click="toggleTitleInfo(t.mgmBldPk)"
                      @keydown.enter.prevent="toggleTitleInfo(t.mgmBldPk)"
                      @keydown.space.prevent="toggleTitleInfo(t.mgmBldPk)"
                    >
                      <td class="px-3 py-2 break-all">
                        <span aria-hidden="true" class="mr-1 inline-block w-3 text-xs">
                          {{ expandedPk === t.mgmBldPk ? '▾' : '▸' }}
                        </span>
                        {{ t.bldNm || '(건물명 없음)' }}
                      </td>
                      <td class="px-3 py-2 font-mono">{{ t.mgmBldPk }}</td>
                      <td class="px-3 py-2 font-mono">{{ t.mgmBldPkNew }}</td>
                    </tr>
                    <!-- 인라인 확장 — 펼친 행만 대장 정보 지연 조회 -->
                    <tr v-if="expandedPk === t.mgmBldPk" class="border-b last:border-b-0">
                      <td colspan="3" class="bg-muted/20 px-3 py-2">
                        <p
                          v-if="infoCache[t.mgmBldPk]?.loading"
                          class="text-xs text-muted-foreground"
                        >
                          대장 정보를 조회하는 중…
                        </p>
                        <p
                          v-else-if="infoCache[t.mgmBldPk]?.errorMsg"
                          class="text-xs text-destructive"
                        >
                          {{ infoCache[t.mgmBldPk]?.errorMsg }}
                        </p>
                        <table v-else-if="infoCache[t.mgmBldPk]?.cols" class="w-full text-xs">
                          <tbody>
                            <tr
                              v-for="c in BULK_COLUMNS"
                              :key="c.key"
                              class="border-b border-border/60 last:border-b-0"
                            >
                              <th
                                class="w-32 py-1 pr-3 text-left font-medium text-muted-foreground"
                              >
                                {{ c.label }}
                              </th>
                              <td class="py-1 break-all">
                                {{ infoCache[t.mgmBldPk]?.cols?.[c.key] }}
                              </td>
                            </tr>
                          </tbody>
                        </table>
                      </td>
                    </tr>
                  </template>
                </tbody>
              </table>
            </div>
          </div>
        </details>

        <details v-if="row.raw != null" class="rounded-lg border p-3" open>
          <summary class="cursor-pointer select-none text-sm font-medium">원본 JSON</summary>
          <div class="mt-2 max-h-[40vh] overflow-auto">
            <ClientOnly>
              <JsonViewer :data="row.raw" />
            </ClientOnly>
          </div>
        </details>
      </template>
    </DialogScrollContent>
  </Dialog>
</template>
