# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 프로젝트 개요

**표준연계키 생성 모듈(S/W)** — SQI Soft 주소 정제/매칭/지오코딩 API(`http://220.76.251.227:9930`, Base Path `/sqiapi/addr`)로 주소에서 표준연계키(건축물대장 PK, `mgmBldPk`)를 **비개발자**가 쉽게 생성·확인하는 웹 콘솔. 메뉴 3개 구성:

- **메뉴1 `/` 표준연계키 생성** (`app/pages/index.vue`) — 주소 입력 → `building_match_clean_union` + `asis/juso`(다지역 감지) + `legcd_n_coord`(위치 좌표) 3건 병렬 호출 → 정제→매칭→생성 3단계 파이프라인 표시 → 키 카드(총괄표제부/표제부 PK, 복사·요약 복사·링크 복사, 매칭 등급 잠정 설명 툴팁, 위치 행+접이식 미니 지도). 대장 정보(`BldInfoDialog.vue`)와 신규 PK 전환(`convert_mgm_bld_pk_old_to_new` — 미존재 PK도 HTTP 200 + `{"mgm_bld_pk_new":null}`, `parseConvertResponse`)은 페이지 이동 없이 **모달**로 표시. 입력창에 PK 형식을 넣으면(`detectPkKind`) 생성 대신 조회·전환 액션 패널 표시 — 신형 10자리 PK는 `mgm_bld_pk_info` 조회 불가(실측 "Cannot match")라 기존 PK 전환으로 유도. `?addr=<주소>` 진입 시 자동 생성(결과 공유 링크). 주소 입력 중 `asis/juso` 디바운스 자동완성(`extractAddrSuggestions`). 최근 생성 이력은 `useKeygenHistory`(localStorage 최근 10건), 클릭 시 자동 재생성. 표제부 동 정보(동명·주/부속·소속 총괄)는 생성 직후 백그라운드 건별 조회, 총괄표제부가 다건이면 총괄별 접이식 그룹으로 표시
- **메뉴2 `/bulk` 표준연계키 일괄처리** (`app/pages/bulk.vue`) — 탭 2개. ① 주소기반 일괄처리: 엑셀 A열=주소 → 키 일괄 생성 ② PK기반 일괄처리: A열=`mgmBldPk` → `mgm_bld_pk_info` 일괄 조회. 두 탭이 워커 풀(동시 5건, 최대 5,000행, **중단 버튼** — 진행분 저장·미처리 행 대기 유지)·결과 테이블(**상태 요약 칩 필터** — 이력 Modal 공용)/행 상세 Modal/xlsx 다운로드/실패 재시도·IndexedDB 이력(레코드 `kind`로 종류 구분, 최근 20건, **JSON 내보내기/가져오기**)을 공유. 파일 없이 **텍스트 붙여넣기** 입력 가능(`pasteToAoa` — 엑셀 표 복사의 탭 구분 열 보존). 업로드 파일의 B열~ 원본 컬럼은 결과 엑셀에 그대로 보존된다(`extraHeaders`/`BulkRow.extra` — 후처리 없이 원본 파일에 결과 컬럼이 붙은 형태)
- **메뉴3 `/tools` 전체 기능** (`app/pages/tools.vue`) — 태그별 기능(API) 목록/검색 → 동적 파라미터 폼 → 실행 → JSON 뷰어 결과(전문가용 콘솔). `?path=<기능경로>&<파라미터>=<값>&run=1` 쿼리로 진입하면 프리필+자동 실행. 최근 호출 이력은 `useCallHistory`(localStorage 최근 20건)

공통: 헤더에 연계 서버 연결 상태 점(`useServerStatus` — 60초 주기 + 클릭 재확인, HTTP 오류 응답도 "도달"로 판정하고 네트워크 실패·타임아웃만 오류).

스택: Nuxt 4 + Vue 3.5 + shadcn-vue(reka-ui) + Tailwind CSS 4 + Pinia + Leaflet(미니 지도, 동적 import). 인증 없음, 한국어 UI 단일.

**UI 표기 정책:** 사용자에게 보이는 문구에는 "API"를 쓰지 않고 **"기능"**으로 표기한다(예: "기능 목록", "기능 검색"). 단 **예외**: 호출 기능 표기 컴포넌트(`ApiUsageNote.vue`)의 라벨은 사용자 지시로 **"이용 API"**를 쓴다. 개발 문서·코드 식별자(`ApiList.vue`, `apiBase` 등)는 API 유지. 앱 타이틀은 "표준연계키 생성 모듈(S/W)"(헤더·브라우저 탭 공통).

**UX 방침:** 키 카드 등의 부가 동작(대장 정보·신규 PK 전환)은 전체 기능(`/tools`) 페이지로 이동하지 않고 **모달**로 처리한다. `/tools?run=1` 연계 링크는 "전체 기능에서 열기"처럼 이동임을 명시한 보조 진입점에만 사용.

## 명령어

패키지 매니저는 **pnpm** (`pnpm-lock.yaml`).

```bash
pnpm dev              # 개발 서버
pnpm build            # SSR 빌드
pnpm generate         # 정적 빌드 (.output/public) — WAR 배포용
pnpm war              # generate + WAR 패키징 (.output/dtent-link.war)
pnpm extract-spec     # API 스펙 스냅샷 재추출 (app/data/api-spec.json 갱신)
pnpm test             # Vitest — tests/ 의 순수 로직 단위 테스트
pnpm lint             # ESLint (@nuxt/eslint) / 자동 수정: pnpm lint:fix
pnpm format           # Prettier / 검사: pnpm format:check
```

단일 테스트 실행: `pnpm vitest run tests/bulk-parse.test.ts`

테스트 대상은 UI가 아닌 순수 로직이다: 키 생성 응답 파싱·PK 형식 감지·좌표 추출(`app/lib/keygen.ts`), 주소 시트 파싱·키 컬럼 매핑(`app/lib/keygen-bulk.ts`), 엑셀/붙여넣기 파싱·헤더 감지(`app/lib/bulk-parse.ts`), 컬럼 매핑(`app/lib/bulk-columns.ts`), 매칭 등급 설명(`app/lib/match-grade.ts`), 이력 파일 직렬화·검증(`app/lib/history-io.ts`), 스펙 파서 헬퍼(`scripts/extract-spec-lib.mjs` — 실행 본문과 분리된 모듈). 새 로직도 이 패턴대로 lib/모듈로 분리해 테스트한다. `app/components/ui/`(shadcn 생성 코드)와 `app/data/`(생성 데이터), `*.md`는 lint/format 대상에서 제외되어 있다.

## 커밋 규칙

`.github/git-commit-instructions.md` 준수: Conventional Commits(scope 금지, `type: 제목`), 제목·본문 모두 한국어, 제목 72자 이내·마침표 없음, 본문은 무엇을·왜 바꿨는지 bullet로. AI·도구 언급 금지.

## 핵심 아키텍처

### API 호출 — 브라우저 직접 호출 (프록시 없음)

대상 API 서버가 CORS를 전면 허용하므로 브라우저가 직접 호출한다. **기존 Nitro 프록시(`server/api/proxy/`)는 제거됨** — 되살리지 말 것. Origin은 `nuxt.config.ts`의 `runtimeConfig.public.apiBase`에 정의되고, generate 시점에 `NUXT_PUBLIC_API_BASE` 환경변수로 재정의 가능(정적 빌드에 구워지므로 변경 시 재생성 필요). HTTPS로 서비스하면 HTTP API가 Mixed Content로 차단되는 제약이 있다(docs/DEPLOY-WAR.md 참조).

### API 스펙 — 정적 스냅샷 방식

대상 서버에 표준 스펙 엔드포인트(`/v3/api-docs` 등)가 **없어서**, `scripts/extract-spec.mjs`가 `swagger-ui-init.js` 안의 인라인 `swaggerDoc`을 파싱해 `app/data/api-spec.json`으로 스냅샷한다(26개 엔드포인트, 9개 태그). 런타임 fetch가 아니라 빌드 타임 정적 데이터다. API 변경 시 `pnpm extract-spec` 후 재빌드.

- summary의 `(수정예정)`/`(삭제예정)` 접두는 추출 시 `statusFlag` 필드로 파싱되어 배지(`StatusFlagBadge.vue`)로 렌더링됨 — 목록에서 숨기지 않는 것이 확정 정책
- `app/composables/useApiSpec.ts`의 `EXCLUDED_TAGS`(`TTA`, `에너지매칭`)가 메뉴3(전체 기능) 노출을 제어(스냅샷에는 유지)
- 타입: `app/types/api.ts`의 `ApiEndpoint`

### 단일 모듈 규칙 — 변경 시 해당 파일만 수정

- **키 생성 응답 파싱** `app/lib/keygen.ts` — `building_match_clean_union` 성공/매칭 실패 판정(실패도 HTTP 200 + `{"error":"cannot match address"}`), 콤마 구분 PK 분해(`match_mgm_bld_pks` 다건, `match_mgm_upper_bld_pks`는 빈 문자열 가능), 동 정보·다지역 후보·자동완성 추출, PK 형식 감지(`detectPkKind` — 구형 `11680-12777` / 신형 10자리), 좌표 추출(`extractCoord` — 응답 `x/y`는 서버가 이미 WGS84로 변환해 줌, 2026-07-28 실측)
- **메뉴2 표시 컬럼 매핑** `app/lib/bulk-columns.ts` — `mgm_bld_pk_info` 응답(`basic_info` + `title_info[0]`) → 표시 컬럼(선정·순서·한글명·포맷). 미존재 PK 응답은 `{"error":"Cannot match"}`. **메뉴1 대장 정보 모달(`BldInfoDialog.vue`)도 이 모듈을 재사용**하므로 컬럼 변경은 이 파일 하나로 양쪽 반영. 결과 테이블/상세 Modal(`app/components/bulk/`)은 컬럼·상태 라벨을 props로 받아 두 탭이 공유
- **매칭 등급 설명** `app/lib/match-grade.ts` — M1/M2/M3 잠정 한글 설명(근거는 실서버 관찰, 파일 주석 참조). **SQI 공식 정의를 받으면 이 파일의 문구만 교체.** 알 수 없는 등급은 지어내지 않고 null(코드만 표기)
- **일괄 이력 파일 입출력** `app/lib/history-io.ts` — 이력 내보내기/가져오기 JSON 직렬화·검증(형식 식별자 `dtent-link/bulk-history`, 깨진 레코드 스킵 집계)

### 조회 이력 — IndexedDB

메뉴2 결과는 `app/composables/useBulkHistory.ts`가 브라우저 IndexedDB(`dtent-link`/`bulk-results`)에 저장(레코드 `kind` 필드로 키 생성/대장 조회 구분, `kind` 없는 과거 레코드는 대장 조회로 간주, 최근 20건 유지). 서버 저장 없음 — PC 이동·공유는 이력 내보내기/가져오기(JSON 파일)로 처리.

### 미니 지도 (`MiniMap.vue`)

Leaflet 1.9 + OSM 공용 타일. 지도가 펼쳐질 때만 동적 import(초기 로드 영향 없음, 빌드 시 별도 청크). 컨테이너의 `isolate z-0`은 필수 — Leaflet 내부 z-index(컨트롤 최대 1000)가 모달 오버레이(z-50)를 뚫는 것을 막는다. 타일 로드 실패(오프라인) 시 카카오맵 링크 폴백. 마커는 기본 아이콘의 이미지 에셋 경로 문제를 피해 `circleMarker`(포인트 컬러) 사용.

## 배포 (정적 WAR)

`pnpm generate` 산출물 + `WEB-INF/web.xml`을 zip → `.war`로 WAS(Tomcat 등)에 배포. 절차·컨텍스트 루트 변경·제약은 `docs/DEPLOY-WAR.md` 참조. 서버 런타임 없이 정적 SPA로 동작하므로 **Nitro server route를 새로 추가하면 WAR 배포에서 동작하지 않는다.** 미니 지도의 OSM 타일은 외부 인터넷이 필요하다(배포 환경 인터넷 접근 가능 확인됨).

## 문서

- `docs/PRD.md` — 요구사항 확정본(v1.2). 단, 메뉴2 데이터 소스는 이후 "PostgreSQL 직접 조회 → API 호출"로 재변경됨(ROADMAP 반영)
- `docs/ROADMAP.md` — Phase별 진행 현황 체크리스트(완료 기준 포함). Task 완료 체크는 완료 기준을 실제 확인한 경우에만
- `docs/DEPLOY-WAR.md` — WAR 배포 가이드

## 디자인

Stripe×Apple "클린 미니멀" 방향 확정(밝은 배경, 넓은 여백, 포인트 컬러 1개 — primary `#b85c00`). 디자인 토큰은 `app/assets/css/main.css`(Tailwind 4 `@theme`), 시연 페이지 `/styleguide`. shadcn-vue 컴포넌트는 `app/components/ui/`에 prefix 없이 설치(`components.json`).
