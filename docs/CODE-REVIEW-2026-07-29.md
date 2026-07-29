# 코드 리뷰 — 버그 및 개선 사항 (2026-07-29)

전 영역(순수 로직 lib / 페이지 / composables·컴포넌트) 코드 리뷰 결과.
확정 버그는 당일 수정 완료, 잠재 버그·개선 사항은 조치 상태를 함께 기록한다.
UI/UX 감사 결과는 문서 하단 별도 섹션 참조.

## 확정 버그 — 수정 완료

### B1. `/bulk` 실행 중 새 엑셀 업로드 시 결과가 뒤섞임 ✅ 수정

- 위치: `app/pages/bulk.vue` — `onFileChange()`, 파일 `<input id="bulk-file">`
- 증상: 일괄처리 실행 중(`running`) 새 파일을 선택하면 `applyParsed()`가 행 목록·진행률을 즉시 교체하지만, 이미 돌고 있는 워커들은 이전 키 목록을 계속 처리하며 **교체된 새 행 목록**에 PK로 매칭해 결과를 덮어씀. 새 데이터셋에 이전 실행 결과가 섞인 채 이력에 저장됨. "텍스트 붙여넣기"는 `running` 가드가 있었으나 파일 업로드에만 없었음.
- 수정: `onFileChange()` 시작부에서 `running` 중 차단 + 파일 input `:disabled="running"` 및 라벨 비활성 스타일.

### B2. `/tools` 결과 패널이 늦게 도착한 이전 응답으로 덮어써짐 ✅ 수정

- 위치: `app/pages/tools.vue` — `run()`, `select()`, `restore()`
- 증상: 기능 A 실행 → 응답 대기 중 기능 B 선택·실행 → A 응답이 늦게 도착하면 B를 보고 있는 화면에 A의 응답이 표시됨(stale response). `index.vue`는 `dongRunId` 등 실행 토큰으로 방지하고 있었으나 `tools.vue`에는 없었음.
- 수정: 실행 토큰(`runSeq`) 도입. `select()`/`restore()`가 진행 중 실행을 무효화(`invalidateRun()`)하고, 응답 도착 시 토큰이 다르면 화면 갱신을 건너뜀. 호출 이력에는 실제 완료된 호출을 그대로 기록.

### B3. IndexedDB 이력 실패가 조용히 삼켜지거나 가져오기가 중간에 멈춤 ✅ 수정

- 위치: `app/composables/useBulkHistory.ts`, `app/pages/bulk.vue` — `onImportHistory()`, `removeHistory()`
- 증상:
  - `useBulkHistory`는 IndexedDB 실패(프라이빗 모드 차단, 쿼터 초과 등)를 전혀 잡지 않음. `onMounted(() => history.refresh())`가 unhandled rejection이 되고 이력이 원인 안내 없이 빈 화면으로 보임.
  - 이력 가져오기 루프의 `await history.save(r)`에 try/catch가 없어 레코드 하나만 저장 실패해도 루프가 즉시 중단되고 아무 안내도 뜨지 않음.
- 수정:
  - `refresh()` — 내부 try/catch, 실패 시 콘솔 경고만 남기고 앱 동작 유지.
  - `get()` — 실패 시 `undefined` 반환(호출부의 "이력을 불러오지 못했습니다" 안내로 이어짐).
  - 가져오기 루프 — 저장 실패 시 중단 사실과 가져온 건수를 에러 토스트로 안내.
  - `removeHistory()` — 삭제 실패 시 에러 토스트(기존엔 실패해도 "삭제했습니다" 표시 가능).

## 잠재 버그 — 실서버 확인 필요 (보류)

### P1. 총괄표제부 PK만 있고 표제부 PK가 빈 응답이 "성공" 처리됨

- 위치: `app/lib/keygen.ts` `parseKeygenResponse` — 실패 판정이 `!upperPk && pks.length === 0`일 때뿐
- 리스크: `match_mgm_upper_bld_pks`만 있고 `match_mgm_bld_pks`가 빈 응답이 실제로 온다면 표제부 0건 카드가 성공으로 노출됨. 테스트에도 이 조합 시나리오 없음.
- 조치: 실서버에서 해당 응답 조합이 발생하는지 확인 후 판정·표시 정책 결정. (임의로 실패 처리로 바꾸면 정상 케이스를 깨뜨릴 수 있어 보류)

## 개선 사항 — 2026-07-29 적용 (우선순위순)

### I1. 중단 시 워커별 최대 1건이 재시도 불가 상태로 남음 ✅ 적용

- 위치: `app/pages/bulk.vue` `executeLookups()`
- for문 구조상 중단 시점에 update 절(`queue.shift()`)이 조건 검사보다 먼저 실행되어 워커별 1건이 큐에서 꺼내진 채 버려졌음. 해당 행은 'pending'으로 남는데 "실패 재시도"는 `error` 상태만 세므로 재시도 대상에서도 빠짐.
- 조치: 중단 검사를 큐에서 꺼내기 전에 하는 while 루프로 변경.

### I2. `saveRecord()`의 대량 행 동기 딥클론 ✅ 적용

- 위치: `app/pages/bulk.vue` `saveRecord()` — `JSON.parse(JSON.stringify(rows.value))`
- 최대 5,000행(+행별 원본 API 응답 `raw`)을 동기 직렬화해 메인 스레드 블로킹.
- 조치: `structuredClone(toRaw(rows.value))`로 교체(반응형 프록시 제거 목적은 동일, JSON 왕복 제거).

### I3. 이력 파일 `version` 필드가 가져오기 검증에 쓰이지 않음 ✅ 적용

- 위치: `app/lib/history-io.ts` `parseBulkHistoryFile`
- `FILE_VERSION`은 내보낼 때만 기록되고 가져올 때는 검사하지 않았음. `isRecord`도 `rows` 내부 항목은 미검증.
- 조치: 상위 버전(`version > FILE_VERSION`) 파일은 안내 메시지와 함께 거부. `rows` 각 행의 필수 필드(seq/pk/status/cols)를 검증해 깨진 행이 섞인 레코드는 통째로 skipped 집계. 테스트 추가.

### I4. IndexedDB 커넥션 미종료 ✅ 적용

- 위치: `app/composables/useBulkHistory.ts` `txRequest()`
- 호출마다 새 커넥션을 열고 닫지 않아, 추후 DB 버전 업그레이드 시 남은 커넥션이 `onblocked`를 유발할 수 있었음.
- 조치: 트랜잭션 `oncomplete`/`onabort`에서 `db.close()`.

### I5. 주소 자동완성 디바운스 타이머 미해제 ✅ 적용

- 위치: `app/pages/index.vue` — `suggestTimer`
- 입력 중 페이지 이동 시 언마운트 후에도 fetch가 실행되어 불필요한 네트워크 호출 발생.
- 조치: `onBeforeUnmount`에서 `clearTimeout`.

### I6. 다지역 판정이 실제 매칭 실패 사유를 덮어씀 ✅ 적용

- 위치: `app/lib/keygen-bulk.ts` `flattenKeygenResult`
- `regions.length > 1`이면 실제 실패 사유(예: 건물번호 누락)와 무관하게 "N개 지역" 안내만 표시됐음.
- 조치: 다지역이면 실패 처리하는 정책은 유지하되, 매칭 자체가 실패한 경우 실제 실패 사유를 앞에 병기. 테스트 추가.

### I7. `/tools?path=` 딥링크가 method를 무시하고 path만 매칭 ✅ 적용

- 위치: `app/pages/tools.vue` `onMounted`
- 같은 경로에 GET/POST가 공존하면 오선택 가능(`restore()`는 method+path 매칭이라 비일관).
- 조치: 선택적 `?method=` 쿼리를 지원해 있으면 method+path로 매칭(기존 링크는 그대로 동작).

### I8. 기타 사소 — 부분 적용

- ✅ `app/lib/bulk-columns.ts` — number 포맷 시 콤마 제거 후 재포맷("12,345.6" 형태 대응). 테스트 추가.
- ✅ `app/components/MiniMap.vue` — `ResizeObserver`로 컨테이너 크기 변경 시 `invalidateSize()` 호출, 언마운트 시 해제.
- ⏸ `app/lib/bulk-parse.ts` — 순수 숫자 헤더("2026" 등) 데이터 오인, `pasteToAoa` 빈 줄 제거로 인한 seq 어긋남: 헤더 감지 휴리스틱·seq 의미를 바꾸면 기존 동작이 달라질 수 있어 현행 유지(실무 영향 낮음).

## UI/UX 개선 — 2026-07-29 적용

UI/UX 감사(접근성·피드백·터치 타깃·일관성·마이크로카피) 결과 9건 적용.

### 우선순위 높음

- ✅ **U1. 이력 삭제에 위험 표시·확인 절차 추가** — 삭제 버튼 4곳(`index.vue` 최근 생성 전체 삭제, `bulk.vue` 일괄 이력 개별 삭제, `tools.vue` 호출 이력 전체/개별 삭제)에 destructive 텍스트 스타일 적용. 전체 삭제 2곳과 일괄 이력 삭제(원본 응답 포함, 복구 불가)는 `window.confirm` 확인 후 실행. 호출 이력 개별 삭제는 저비용 항목이라 스타일만 적용.
- ✅ **U2. 키 카드 버튼 터치 타깃 확대** — `index.vue` 키 카드의 복사/대장 정보/신규 PK 전환 등 `h-7`(28px) 버튼을 모바일 `h-9`(36px)/데스크톱 `md:h-7` 반응형으로 변경.

### 우선순위 중간

- ✅ **U3. 오류 원문 노출 방식 통일** — `index.vue` 네트워크 오류는 평이한 안내 문구 + "오류 원문 보기" 접기(`ResultPanel` 방식과 통일). `BulkRowDetailDialog`도 처리 실패(status=error) 원문은 접어서 제공하되, 자체 작성한 안내(입력 오류·미존재)는 그대로 노출.
- ✅ **U4. 일괄처리 남은 시간 표시** — `bulk.vue` 진행률 바 아래에 처리 속도 기반 ETA("약 N분 남음") 표시. 표본 5건 미만에서는 미표시.
- ✅ **U5. 에러 토스트 즉시 낭독** — `AppToaster.vue` 컨테이너 일괄 `aria-live="polite"`를 토스트별 role로 교체(오류=`alert`, 일반=`status`).
- ✅ **U6. 서버 상태 변경 자동 안내** — `default.vue` 상태 라벨에 `aria-live="polite"` 추가(online↔offline 전환 낭독).

### 우선순위 낮음

- ✅ **U7. 동 정보 로딩 스피너** — `index.vue` 동 정보 로딩 표시를 다른 로딩과 동일한 스피너+텍스트 조합으로 통일.
- ✅ **U8. 필수 표시 색상 토큰화** — `ParamForm.vue`의 하드코딩 `text-red-700` 2곳을 `text-destructive`로 교체.
- ✅ **U9. 매칭 실패 영역 role=alert** — `index.vue` 실패 카드에 `role="alert"` 추가.

### 잘 되어 있어 유지한 부분

클릭 가능한 리스트/행의 `tabindex + Enter/Space + focus-visible` 패턴, 주소 자동완성 ARIA combobox 구현, 액션별 성공/실패 토스트, 실패 시 구체적 복구 경로(유사 주소 재시도·실패 건 재시도), 매칭 등급 "잠정" 표기 원칙, 빈 상태 안내, 결과 테이블 가로 스크롤 처리.
