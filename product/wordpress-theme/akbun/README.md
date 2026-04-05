# Akbun WordPress Theme

akbun 티스토리 스킨을 WordPress 테마로 포팅한 프로젝트. Warm minimal 디자인, 콘텐츠 중심, 빠른 로딩 속도를 추구한다.

## 기능

| 기능 | 설명 |
|---|---|
| 디자인 | 티스토리 스킨과 동일한 warm minimal 스타일 |
| 반응형 | Desktop / Tablet / Mobile 3단계 브레이크포인트 |
| Floating ToC | 글 본문 h1/h2 기반 자동 생성 (1400px 이상에서 표시) |
| 코드 하이라이팅 | Prism.js CDN 기반, 10+ 언어 지원 |
| AdSense | Customizer에서 설정, 헤더/글 상단/글 하단/사이드바 4개 슬롯 |
| 성능 최적화 | emoji 제거, jQuery migrate 제거, 조건부 스크립트 로딩 |
| 보안 헤더 | X-Content-Type-Options, X-Frame-Options, Referrer-Policy |

## 배포 방법

### 1. 테마 ZIP 생성

```bash
make zip
```

`akbun.zip` 파일이 생성된다.

### 2. WordPress에 업로드

1. WordPress 관리자 > 외모 > 테마 > 새로 추가 > 테마 업로드
2. `akbun.zip` 선택 후 설치
3. 활성화

### 3. 초기 설정

1. **메뉴 등록**: 외모 > 메뉴 > "Primary Menu" 위치에 메뉴 할당
2. **AdSense 설정**: 외모 > 사용자 정의하기 > Google AdSense
   - Publisher ID 입력 (예: `ca-pub-1234567890`)
   - 각 슬롯 ID 입력
3. **블로그 설명**: 외모 > 사용자 정의하기 > 사이트 아이덴티티 > Blog Description

## 로컬 테스트

### Docker Compose (권장)

```bash
make up
# http://localhost:8080 접속
# 테마 파일 수정 시 브라우저 새로고침으로 즉시 반영
```

```bash
make down    # 중지
make clean   # 데이터 포함 전체 삭제
make logs    # 로그 확인
```

### Dev Container (VS Code)

1. VS Code에서 이 디렉터리를 열기
2. "Reopen in Container" 선택
3. http://localhost:8080 에서 WordPress 확인

### 수동 설치

PHP 8.0+가 설치된 환경에서:
1. WordPress를 로컬에 설치
2. `wp-content/themes/` 아래에 이 디렉터리를 심볼릭 링크 또는 복사

## Cafe24 + Cloudflare 환경 참고사항

### Cloudflare 캐시 설정

Cafe24 WordPress 호스팅에서 Cloudflare CDN을 사용할 때:

- **Page Rule**: `sungwook-diary.com/wp-admin/*` → Cache Level: Bypass
- **Page Rule**: `sungwook-diary.com/*` → Cache Level: Standard
- 정적 자원(CSS, JS, 이미지)은 Cloudflare에서 자동 캐시됨
- 글 발행 후 캐시 퍼지가 필요하면 Cloudflare 플러그인 사용

### 성능 최적화 체크리스트

- [ ] Cloudflare에서 Auto Minify (CSS, JS) 활성화
- [ ] Cloudflare에서 Brotli 압축 활성화
- [ ] WordPress 캐시 플러그인 설치 (WP Super Cache 또는 W3 Total Cache)
- [ ] 이미지 최적화 플러그인 (ShortPixel 또는 Imagify)

## 보안 패치 관리

### 자동 업데이트 설정

WordPress 관리자 > 설정에서 자동 업데이트를 활성화한다:

`wp-config.php`에 추가:

```php
// WordPress 코어 마이너 업데이트 자동 적용
define( 'WP_AUTO_UPDATE_CORE', 'minor' );
```

### 주기적 보안 관리

1. **WordPress 코어**: 마이너 버전은 자동 업데이트, 메이저 버전은 수동 확인
2. **PHP 버전**: Cafe24 관리자에서 PHP 8.x 최신 패치 적용
3. **플러그인**: 최소한으로 유지, 사용하지 않는 플러그인은 삭제
4. **테마 업데이트**: 이 저장소에서 수정 후 ZIP으로 재배포
5. **보안 플러그인 권장**: Wordfence (무료) 또는 Sucuri
6. **Cloudflare WAF**: 무료 플랜에서도 기본 WAF 규칙 적용됨

### 보안 모니터링 자동화

Cafe24 + Cloudflare 조합에서 활용할 수 있는 방법:

- **Cloudflare Security Events**: 대시보드에서 공격 시도 모니터링
- **WordPress Site Health**: 관리자 > 도구 > 사이트 상태에서 주기적 확인
- **Wordfence 알림**: 이메일로 보안 이벤트 알림 수신

## 스크린샷

WordPress 테마 목록에 표시할 스크린샷:

```bash
# screenshot.svg를 PNG로 변환 (1200x900)
# macOS: rsvg-convert screenshot.svg -o screenshot.png
# Linux: apt install librsvg2-bin && rsvg-convert screenshot.svg -o screenshot.png
```

## 디자인 시스템

| 토큰 | 값 | 용도 |
|---|---|---|
| `--color-bg` | `#fafafa` | 배경 |
| `--color-text` | `#141413` | 본문 텍스트 |
| `--color-heading-primary` | `#7a2f2f` | h1 제목 (다크 레드) |
| `--color-accent` | `#007a8f` | 링크, 인터랙션 (틸) |
| `--color-bold` | `#ec4899` | 볼드 텍스트 (핑크) |
| `--color-notice` | `#d97757` | 공지 배지 (오렌지) |

## 라이선스

GPL-2.0-or-later
