# WAR 배포 가이드 (정적 WAR 방식)

- 산출물: `.output/dtent-link.war` (프로젝트 로컬 생성, git 미포함)
- 생성 절차: `pnpm generate` → `.output/public`(정적 파일) + `deploy/WEB-INF/web.xml`(저장소 포함 템플릿)을 zip으로 묶어 `.war` 패키징
- 생성일 기준 컨텍스트 루트 가정: `/` (ROOT 배포). 하위 경로(`/dtent-link`)로 배포하려면 아래 "컨텍스트 루트 변경" 참고.

## 패키징 절차 (Windows PowerShell)

```powershell
pnpm generate
$stage = New-Item -ItemType Directory -Force "$env:TEMP\war-stage"
Remove-Item "$stage\*" -Recurse -Force -ErrorAction SilentlyContinue
Copy-Item .output\public\* $stage -Recurse
Copy-Item deploy\WEB-INF $stage -Recurse
Set-Location $stage
tar.exe -a -c -f "<프로젝트경로>\.output\dtent-link.zip" @(Get-ChildItem -Name)
Rename-Item "<프로젝트경로>\.output\dtent-link.zip" "dtent-link.war"
```

> ⚠️ **반드시 `.zip` 확장자로 생성한 뒤 `.war`로 이름을 변경할 것.** `tar.exe -a`는 확장자로 포맷을 결정하는데, `.war`는 인식하지 못해 **zip이 아닌 tar 형식**으로 만들어 버린다(Tomcat이 풀지 못함). 생성 후 파일 선두 2바이트가 `PK`인지 확인하면 확실하다.
> `Compress-Archive`도 쓰지 말 것 — zip 엔트리 경로를 백슬래시(`\`)로 기록해 일부 WAS에서 인식하지 못한다.

## API 호출 방식 — 브라우저 직접 호출 (리버스 프록시 불필요)

브라우저가 API 서버(`http://220.76.251.227:9930`)를 **직접 호출**한다. 대상 API 서버가 CORS를 전면 허용(`Access-Control-Allow-Origin: *`)하고 있어 별도의 프록시 설정 없이 어떤 WAS에 배포해도 동작한다.

- API 서버 주소는 `nuxt.config.ts`의 `runtimeConfig.public.apiBase`에 정의되며, generate 시점에 `NUXT_PUBLIC_API_BASE` 환경변수로 재정의할 수 있다(정적 빌드에 구워지므로 변경 시 재생성 필요).
- ⚠️ 콘솔을 **HTTPS**로 서비스하는 경우, API가 HTTP라서 브라우저가 Mixed Content로 차단한다. 이 경우 API 서버의 HTTPS 제공 또는 웹서버 리버스 프록시가 필요하다(필요 시 요청).

## 배포 방법

1. `dtent-link.war`를 WAS의 배포 디렉토리에 배치(Tomcat: `webapps/ROOT.war`로 이름 변경 권장)
2. WAS 재기동
3. 브라우저에서 접속 → 메뉴1에서 아무 API 실행 → 2xx 응답 확인

## 컨텍스트 루트 변경 시 (`/dtent-link` 등 하위 경로 배포)

정적 산출물은 절대경로(`/_nuxt/...`) 기준으로 빌드된다. 하위 경로로 배포하려면 `nuxt.config.ts`에 `app.baseURL: '/dtent-link/'`를 설정하고 다시 generate + WAR 패키징해야 한다.

## 제약 사항 (정적 WAR 방식)

- 서버 사이드 렌더링 없음(SPA/프리렌더 정적 페이지) — 기능 차이는 없음
- 조회 이력은 각 사용자 브라우저 IndexedDB에 저장됨(서버 저장 아님) — 기존과 동일
- API 스펙 갱신 시(`npm run extract-spec`) WAR 재생성 필요
