# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 프로젝트 개요

SQI Soft 주소 정제/매칭/지오코딩 API(`http://220.76.251.227:9930`, Base Path `/sqiapi/addr`)를 **비개발자**가 쉽게 호출·확인할 수 있는 테스트 콘솔. Swagger UI 대체 목적. 메뉴 2개 구성:

- **메뉴1 `/`** (`app/pages/index.vue`) — API 테스트 콘솔: 태그별 API 목록/검색 → 동적 파라미터 폼 → 실행 → JSON 뷰어 결과. 최근 호출 이력은 `useCallHistory`(localStorage 최근 20건, 응답 본문 미저장)로 기록하고 클릭 시 파라미터 복원
- **메뉴2 `/bulk`** (`app/pages/bulk.vue`) — 엑셀(A열=`mgmBldPk`) 업로드 → `mgm_bld_pk_info` API 일괄 조회(동시 5건 워커 풀, 최대 5,000행) → 결과 테이블/Modal/xlsx 다운로드/실패 행 재시도 → IndexedDB 이력 저장(최근 20건 초과분 자동 삭제)

스택: Nuxt 4 + Vue 3.5 + shadcn-vue(reka-ui) + Tailwind CSS 4 + Pinia. 인증 없음, 한국어 UI 단일.

## 명령어

패키지 매니저는 **pnpm** (`pnpm-lock.yaml`).

```bash
pnpm dev              # 개발 서버
pnpm build            # SSR 빌드
pnpm generate         # 정적 빌드 (.output/public) — WAR 배포용
pnpm extract-spec     # API 스펙 스냅샷 재추출 (app/data/api-spec.json 갱신)
pnpm test             # Vitest — tests/ 의 순수 로직 단위 테스트
pnpm lint             # ESLint (@nuxt/eslint) / 자동 수정: pnpm lint:fix
pnpm format           # Prettier / 검사: pnpm format:check
```

단일 테스트 실행: `pnpm vitest run tests/bulk-parse.test.ts`

테스트 대상은 UI가 아닌 순수 로직이다: 엑셀 파싱·헤더 감지(`app/lib/bulk-parse.ts`), 컬럼 매핑(`app/lib/bulk-columns.ts`), 스펙 파서 헬퍼(`scripts/extract-spec-lib.mjs` — 실행 본문과 분리된 모듈). 새 로직도 이 패턴대로 lib/모듈로 분리해 테스트한다. `app/components/ui/`(shadcn 생성 코드)와 `app/data/`(생성 데이터), `*.md`는 lint/format 대상에서 제외되어 있다.

## 핵심 아키텍처

### API 호출 — 브라우저 직접 호출 (프록시 없음)

대상 API 서버가 CORS를 전면 허용하므로 브라우저가 직접 호출한다. **기존 Nitro 프록시(`server/api/proxy/`)는 제거됨** — 되살리지 말 것. Origin은 `nuxt.config.ts`의 `runtimeConfig.public.apiBase`에 정의되고, generate 시점에 `NUXT_PUBLIC_API_BASE` 환경변수로 재정의 가능(정적 빌드에 구워지므로 변경 시 재생성 필요). HTTPS로 서비스하면 HTTP API가 Mixed Content로 차단되는 제약이 있다(docs/DEPLOY-WAR.md 참조).

### API 스펙 — 정적 스냅샷 방식

대상 서버에 표준 스펙 엔드포인트(`/v3/api-docs` 등)가 **없어서**, `scripts/extract-spec.mjs`가 `swagger-ui-init.js` 안의 인라인 `swaggerDoc`을 파싱해 `app/data/api-spec.json`으로 스냅샷한다(26개 엔드포인트, 9개 태그). 런타임 fetch가 아니라 빌드 타임 정적 데이터다. API 변경 시 `pnpm extract-spec` 후 재빌드.

- summary의 `(수정예정)`/`(삭제예정)` 접두는 추출 시 `statusFlag` 필드로 파싱되어 배지(`StatusFlagBadge.vue`)로 렌더링됨 — 목록에서 숨기지 않는 것이 확정 정책
- `app/composables/useApiSpec.ts`의 `EXCLUDED_TAGS`(`TTA`, `에너지매칭`)가 메뉴1 노출을 제어(스냅샷에는 유지)
- 타입: `app/types/api.ts`의 `ApiEndpoint`

### 메뉴2 컬럼 매핑 — 단일 모듈 규칙

`mgm_bld_pk_info` 응답(`basic_info` + `title_info[0]`) → 표시 컬럼(B열~) 매핑은 **`app/lib/bulk-columns.ts` 한 곳에서만** 관리한다(컬럼 선정·순서·한글명·포맷). 컬럼 변경은 이 파일만 수정. 미존재 PK 응답은 `{"error":"Cannot match"}`.

### 조회 이력 — IndexedDB

메뉴2 결과는 `app/composables/useBulkHistory.ts`가 브라우저 IndexedDB(`dtent-link`/`bulk-results`)에 저장. 서버 저장 없음.

## 배포 (정적 WAR)

`pnpm generate` 산출물 + `WEB-INF/web.xml`을 zip → `.war`로 WAS(Tomcat 등)에 배포. 절차·컨텍스트 루트 변경·제약은 `docs/DEPLOY-WAR.md` 참조. 서버 런타임 없이 정적 SPA로 동작하므로 **Nitro server route를 새로 추가하면 WAR 배포에서 동작하지 않는다.**

## 문서

- `docs/PRD.md` — 요구사항 확정본(v1.2). 단, 메뉴2 데이터 소스는 이후 "PostgreSQL 직접 조회 → API 호출"로 재변경됨(ROADMAP 반영)
- `docs/ROADMAP.md` — Phase별 진행 현황 체크리스트(완료 기준 포함). Task 완료 체크는 완료 기준을 실제 확인한 경우에만
- `docs/DEPLOY-WAR.md` — WAR 배포 가이드

## 디자인

Stripe×Apple "클린 미니멀" 방향 확정(밝은 배경, 넓은 여백, 포인트 컬러 1개). 디자인 토큰은 `app/assets/css/main.css`(Tailwind 4 `@theme`), 시연 페이지 `/styleguide`. shadcn-vue 컴포넌트는 `app/components/ui/`에 prefix 없이 설치(`components.json`).
