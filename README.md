# dtent-link — 주소 API 테스트 콘솔

SQI Soft **주소 정제/매칭/지오코딩 API**(`http://220.76.251.227:9930`, Base Path `/sqiapi/addr`)를 비개발자도 쉽게 호출하고 결과를 확인할 수 있는 웹 콘솔입니다. 표준 Swagger UI를 대체하여 "주소 입력 → 실행 → 결과 확인" 수준으로 단순화했습니다.

## 주요 기능

| 메뉴 | 경로 | 설명 |
|---|---|---|
| API 테스트 콘솔 | `/` | 태그별 API 목록·검색 → 동적 파라미터 폼 → 실행 → JSON 뷰어로 결과 확인. `(수정예정)`/`(삭제예정)` API는 배지로 구분 표시. 최근 호출 이력(localStorage 최근 20건)에서 클릭 한 번으로 파라미터 복원 |
| 엑셀 일괄 조회 | `/bulk` | 엑셀 A열의 `mgmBldPk`(건축물대장 PK) 업로드 → 건축물대장 정보 일괄 조회(동시 5건, 최대 5,000행) → 결과 테이블·행 클릭 상세 Modal·xlsx 다운로드·실패 행만 재시도. 조회 이력은 브라우저 IndexedDB에 저장(최근 20건) |
| 스타일가이드 | `/styleguide` | 디자인 토큰·공통 컴포넌트 시연 페이지 |

## 기술 스택

- **Nuxt 4** (Vue 3.5) + TypeScript
- **shadcn-vue**(reka-ui) + **Tailwind CSS 4** + Pinia
- 엑셀 처리: SheetJS(xlsx) / JSON 뷰어: vue-json-pretty
- 인증 없음 · 한국어 UI · 서버 런타임 불필요(정적 SPA)

## 시작하기

요구사항: Node.js 20+, pnpm

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
