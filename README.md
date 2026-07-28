# kict-dtnet-link — 표준연계키 생성 모듈(S/W)

**표준연계키 생성 모듈(S/W)** — SQI Soft 주소 정제/매칭/지오코딩 API(`http://220.76.251.227:9930`, Base Path `/sqiapi/addr`)를 비개발자도 쉽게 호출하고 결과를 확인할 수 있는 웹 콘솔입니다. 표준 Swagger UI를 대체하여 "주소 입력 → 실행 → 결과 확인" 수준으로 단순화했습니다.

> UI 표기 정책: 비개발자 대상 화면이므로 사용자에게 보이는 문구에는 "API" 대신 **"기능"**으로 표기합니다(개발 문서·코드 식별자는 API 유지).

## 주요 기능

| 메뉴 | 경로 | 설명 |
|---|---|---|
| 표준연계키 생성 | `/` | 건물 주소 입력(자동완성 지원) → 주소 정제·건축물대장 매칭을 거쳐 표준연계키(건축물대장 PK) 생성. 3단계 파이프라인 표시, 키 카드(복사·요약 복사·링크 복사), 건축물대장 정보 원클릭 연계, 신규 PK 전환 모달(페이지 이동 없이 결과 확인·복사), 표제부 동 정보 자동 조회(총괄 다건이면 총괄별 그룹 표시). `?addr=<주소>` 링크로 결과 공유 가능. 최근 생성 이력(localStorage 최근 10건) 클릭 시 자동 재생성 |
| 표준연계키 일괄처리 | `/bulk` | 탭 2개 — ① **주소기반 일괄처리**: 엑셀 A열의 주소 업로드 → 표준연계키 일괄 생성 ② **PK기반 일괄처리**: A열의 표준연계키(`mgmBldPk`) 업로드 → 건축물대장 정보 일괄 조회. 공통: 동시 5건·최대 5,000행, 결과 테이블·행 클릭 상세 Modal·xlsx 다운로드(업로드 파일의 B열~ 원본 컬럼 보존)·실패 행만 재시도, 브라우저 IndexedDB 이력(최근 20건, 처리 종류 배지 구분) |
| 전체 기능 | `/tools` | 태그별 기능 목록·검색 → 동적 파라미터 폼 → 실행 → JSON 뷰어로 결과 확인(전문가용 콘솔). `(수정예정)`/`(삭제예정)` API는 배지로 구분 표시. 최근 호출 이력(localStorage 최근 20건)에서 클릭 한 번으로 파라미터 복원 |
| 스타일가이드 | `/styleguide` | 디자인 토큰·공통 컴포넌트 시연 페이지 |

## 기술 스택

- **Nuxt 4** (Vue 3.5) + TypeScript
- **shadcn-vue**(reka-ui) + **Tailwind CSS 4** + Pinia
- 엑셀 처리: SheetJS(xlsx) / JSON 뷰어: vue-json-pretty
- 인증 없음 · 한국어 UI · 서버 런타임 불필요(정적 SPA)

## 시작하기

요구사항: Node.js 20+, pnpm

> Windows에서는 **경로가 깊은 위치에 클론하지 마세요.** 경로가 길면(약 240자 초과) `pnpm install`의 `nuxt prepare` 단계가 ESM 모듈 해석 오류(`Package import specifier "#..." is not defined`)로 실패할 수 있습니다. `D:\workspace\...` 수준의 짧은 경로를 권장합니다.

```bash
pnpm install        # 의존성 설치
pnpm dev            # 개발 서버 (http://localhost:3000)
```

### 빌드

```bash
pnpm build          # SSR 빌드 (.output/)
pnpm generate       # 정적 빌드 (.output/public) — WAR 배포용
pnpm preview        # 빌드 결과 미리보기
```

### 테스트 · 코드 품질

```bash
pnpm test           # Vitest — 순수 로직 단위 테스트 (tests/)
pnpm lint           # ESLint (@nuxt/eslint) / 자동 수정: pnpm lint:fix
pnpm format         # Prettier 포맷 적용 / 검사: pnpm format:check
```

## 환경변수

| 변수 | 기본값 | 설명 |
|---|---|---|
| `NUXT_PUBLIC_API_BASE` | `http://220.76.251.227:9930` | 브라우저가 직접 호출하는 API 서버 Origin. **generate 시점에 정적 빌드에 구워지므로** 변경 시 재생성 필요 |

`.env.example`을 참고해 `.env`를 구성합니다.

> 대상 API 서버가 CORS를 전면 허용하므로 브라우저가 직접 호출하며 별도 프록시가 없습니다. 단, 콘솔을 **HTTPS로 서비스하면** HTTP API 호출이 Mixed Content로 차단됩니다(이 경우 리버스 프록시 필요 — [docs/DEPLOY-WAR.md](docs/DEPLOY-WAR.md) 참조).

## API 스펙 갱신

대상 서버에 표준 스펙 엔드포인트(`/v3/api-docs` 등)가 없어, `swagger-ui-init.js`의 인라인 스펙을 파싱해 `app/data/api-spec.json`에 정적 스냅샷으로 보관합니다(26개 엔드포인트, 9개 태그).

대상 API가 변경되면:

```bash
pnpm extract-spec   # 스냅샷 재추출 (app/data/api-spec.json 갱신)
pnpm generate       # 재빌드 (배포 중이면 WAR 재패키징 필요)
```

## 배포

정적 WAR 방식: `pnpm generate` 산출물 + `WEB-INF/web.xml`을 zip으로 묶어 `.war`로 패키징하고 WAS(Tomcat 등)에 배포합니다. 절차·컨텍스트 루트 변경 방법은 [docs/DEPLOY-WAR.md](docs/DEPLOY-WAR.md)를 참조하세요.

## 문서

- [docs/PRD.md](docs/PRD.md) — 제품 요구사항 문서
- [docs/ROADMAP.md](docs/ROADMAP.md) — Phase별 개발 로드맵·진행 현황
- [docs/DEPLOY-WAR.md](docs/DEPLOY-WAR.md) — WAR 배포 가이드
