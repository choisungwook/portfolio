# 공유 URL 본문 추출

- URL을 먼저 DB에 저장하고 성공 응답 반환
- 백그라운드 순서: URL 검사 → HTML 가져오기 → 본문 추출 → DB 갱신 → AI 요약
- 본문 추출 실패 시 URL·사용자가 지정한 제목·태그 유지
- 동일 URL 재전송 시 기존 문서 반환, 중복 추출·AI 호출 없음
- 직접 전달한 body는 기존 API와 호환, 추가 URL 요청 없음
- 단축어 준비: [iOS 공유 시트 설정](02-setup.md)

## 추출 정책

- 스트리밍 이벤트 파서인 htmlparser2 사용, 전체 DOM 생성 없음
- article 우선, 없으면 main, 둘 다 없으면 페이지의 보이는 텍스트 사용
- 제목·문단·목록을 Markdown 텍스트로 저장
- script·style·iframe·form·nav·header·footer·aside 및 명시적으로 숨겨진 요소 제외
- 이벤트 속성과 원문 HTML 태그는 출력에 포함하지 않음
- 원문 이미지·스크립트·스타일·링크 주소 재요청 없음
- 제목: og:title, title 순서; 직접 입력한 제목 우선

| 항목 | 제한 |
| --- | --- |
| URL | HTTP(S), 기본 포트, 사용자 정보 없는 주소 |
| 응답 | UTF-8(utf8 별칭 포함) 또는 US-ASCII HTML, 압축 해제 후 최대 256,000바이트 |
| 시간 | DNS·리다이렉트·본문 수신을 합쳐 8초 |
| 리다이렉트 | 최대 3회, 매 목적지 재검사, HTTPS → HTTP 거절 |
| HTML 복잡도 | 요소 20,000개·깊이 128단계 이하 |
| 본문 | 40~100,000자 |

## 내부 주소 보호

- loopback·사설·link-local·multicast·예약 IP 및 IPv4-mapped IPv6 거절
- 정수·16진수 등 대체 IP 표기도 URL 정규화 후 검사
- localhost·local·internal 등 로컬 호스트명 거절
- 고정 DoH 주소에서 A·AAAA 응답 확인, 주소 중 하나라도 비공개이면 거절
- DNS 오류·빈 응답·비정상 응답 시 외부 페이지 요청 중단
- 앱의 Authorization·Cookie·Access JWT를 외부 사이트로 전달하지 않음
- DNS 확인과 실제 fetch의 주소 해석은 별도 단계; DNS rebinding 완전 차단을 보장하는 IP 고정 방식은 아님
- 사설 네트워크에 접근하는 VPC·서비스 바인딩을 본문 추출 경로에 연결하지 않음

## 상태

| extraction_status | 의미 |
| --- | --- |
| pending | URL 저장 완료, 본문 처리 중 |
| done | 추출한 본문 저장 완료 |
| failed | 추출 실패, 원문 링크 유지 |
| provided | API 호출자가 본문 전달 |
| unavailable | 기능 추가 전에 저장한 문서 |

- 본문 화면의 새로고침으로 최신 제목·본문·AI 상태 확인
- 정적 HTML에 본문이 없는 SPA·로그인 페이지·유료 본문은 추출 대상에서 제외될 수 있음
- 실패한 추출의 자동 재시도·기존 문서 일괄 재추출은 미지원
- waitUntil은 영속 작업 큐가 아님; 런타임 중단 시 pending으로 남을 수 있음

## 로컬 CPU 측정

workspace에서 workerd CPU 프로파일을 측정한다.

```bash
npm run benchmark:extraction
```

- 2026-09-07 로컬 workerd, 사전 실행 10회 후 100회씩 3묶음 측정
- Profiler 샘플에서 idle·program 시간을 제외한 활성 시간 사용, GC 포함
- 아래 값은 묶음별 회당 평균; 개별 요청 최대값·p95가 아님

| 입력 | 회당 평균 CPU, 3회 측정 |
| --- | --- |
| 100,000바이트 긴 HTML | 1.122 / 1.074 / 1.108ms |
| 256,000바이트 긴 HTML | 1.269 / 1.262 / 1.250ms |
| 요소가 많은 81,019바이트 HTML | 1.664 / 1.680 / 1.748ms |

- 측정 결과에 따라 DOM 없는 경량 추출기를 사용
- 네트워크 검사·인증·DB·AI를 포함한 운영 요청 전체 CPU는 별도 측정 필요
- 실제 Workers 무료 구간 10ms 통과와 iPhone 실기기 공유 실행은 배포 후 검증 항목
- 로컬 테스트: 요청 선응답·중복 방지·실패 보존·주소 차단·응답 한도·workerd 호환성

## 참고

- [Cloudflare CPU 측정](https://developers.cloudflare.com/workers/observability/dev-tools/cpu-usage/)
- [Workers 타이머 제약](https://developers.cloudflare.com/workers/runtime-apis/performance/)
- [htmlparser2](https://github.com/fb55/htmlparser2)
