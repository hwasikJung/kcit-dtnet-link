# WAR 배포 가이드 (정적 WAR 방식)

- 산출물: `.output/dtent-link.war` (프로젝트 로컬 생성, git 미포함)
- 생성 절차: `npm run generate` → `.output/public`(정적 파일) + `WEB-INF/web.xml`을 zip으로 묶어 `.war` 패키징
- 생성일 기준 컨텍스트 루트 가정: `/` (ROOT 배포). 하위 경로(`/dtent-link`)로 배포하려면 아래 "컨텍스트 루트 변경" 참고.

## ⚠️ 반드시 필요한 사전 조건 — 리버스 프록시

이 앱은 브라우저에서 `/api/proxy/...` 경로로 API를 호출한다. Node 서버 배포에서는 Nitro가 이 경로를 대상 서버로 중계했지만, **정적 WAR에는 서버 로직이 없다.** 따라서 WAS 앞단(또는 WAS 자체)에서 아래 프록시 규칙을 설정하지 않으면 **메뉴1 API 테스트와 메뉴2 엑셀 일괄 조회가 모두 동작하지 않는다.**

```
/api/proxy/{나머지경로}  →  http://220.76.251.227:9930/{나머지경로}
```

예: `/api/proxy/sqiapi/addr/addr_clean?input_addr=...` → `http://220.76.251.227:9930/sqiapi/addr/addr_clean?input_addr=...`

> 보안 참고: Node 프록시에 있던 경로 화이트리스트(`/sqiapi/addr` 접두만 허용)를 유지하려면 프록시 규칙을 `/api/proxy/sqiapi/addr/` 접두로만 매핑할 것(아래 예시가 이 방식).

### Apache (mod_proxy)

```apache
ProxyPreserveHost Off
ProxyPass        /api/proxy/sqiapi/addr/ http://220.76.251.227:9930/sqiapi/addr/
ProxyPassReverse /api/proxy/sqiapi/addr/ http://220.76.251.227:9930/sqiapi/addr/
```

### Nginx

```nginx
location /api/proxy/sqiapi/addr/ {
    proxy_pass http://220.76.251.227:9930/sqiapi/addr/;
    proxy_set_header Host 220.76.251.227:9930;
}
```

### WebtoB (JEUS 앞단)

`http.m`의 REVERSE_PROXY 절에 등록:

```
*REVERSE_PROXY
addr_proxy
    PathPrefix = "/api/proxy/sqiapi/addr/",
    ServerAddress = "220.76.251.227:9930",
    ServerPathPrefix = "/sqiapi/addr/"
```

(버전에 따라 지시자 이름이 다를 수 있으므로 사용 중인 WebtoB 매뉴얼의 Reverse Proxy 절 참고)

### Tomcat 단독 배포인 경우

Tomcat 자체에는 리버스 프록시 기능이 없다. 다음 중 하나를 선택:
1. 앞단에 Apache/Nginx를 두고 위 규칙 적용(권장)
2. Tomcat `rewrite` valve는 프록시가 아니므로 불가 — 대신 별도 프록시 서블릿을 추가해야 함(현재 범위 밖, 필요 시 요청)

## 배포 방법

1. `dtent-link.war`를 WAS의 배포 디렉토리에 배치(Tomcat: `webapps/ROOT.war`로 이름 변경 권장)
2. 리버스 프록시 규칙 적용 후 웹서버/WAS 재기동
3. 브라우저에서 접속 → 메뉴1에서 아무 API 실행 → 2xx 응답 확인(프록시 설정 검증)

## 컨텍스트 루트 변경 시 (`/dtent-link` 등 하위 경로 배포)

정적 산출물은 절대경로(`/_nuxt/...`, `/api/proxy/...`) 기준으로 빌드된다. 하위 경로로 배포하려면 `nuxt.config.ts`에 `app.baseURL: '/dtent-link/'`를 설정하고 다시 generate + WAR 패키징해야 한다(프록시 규칙 경로도 동일 접두로 조정).

## 제약 사항 (정적 WAR 방식)

- 서버 사이드 렌더링 없음(SPA/프리렌더 정적 페이지) — 기능 차이는 없음
- 조회 이력은 각 사용자 브라우저 IndexedDB에 저장됨(서버 저장 아님) — 기존과 동일
- API 스펙 갱신 시(`npm run extract-spec`) WAR 재생성 필요
