# Docker 실습 - Nginx로 CDN 캐시 취약점 재현

AWS 계정 없이 Docker와 Nginx로 CDN 캐시 취약점을 로컬에서 재현합니다. Nginx가 CDN 역할을 대신합니다.

## 사전 준비

- [Docker Desktop](https://docs.docker.com/get-docker/) (Docker Compose 포함)

아래 명령어로 Docker가 정상 설치되었는지 확인합니다.

```bash
docker --version
```

## 아키텍처

CloudFront의 캐시 동작을 Nginx로 동일하게 재현합니다.

| CDN (CloudFront) | Docker (Nginx) |
|---|---|
| CloudFront → S3 (정적 파일) | Nginx → /usr/share/nginx/html |
| CloudFront → ALB → EC2 (API) | Nginx → proxy_pass → Flask 컨테이너 |
| Cache Policy: `cookie_behavior = "none"` | `proxy_cache_key`에 Cookie 미포함 (URL만 사용) |
| `x-cache: Hit from cloudfront` | `X-Cache-Status: HIT` |

**핵심은 동일합니다.** Nginx(CDN 역할)가 캐시 키에 Cookie를 포함하지 않으므로, URL만으로 캐시를 구분합니다.

## 실행

Docker Compose로 컨테이너를 빌드하고 실행합니다.

```bash
cd docker
docker compose up --build
```

정상 기동되면 `http://localhost:8080`으로 접속합니다. 로그인 페이지가 표시됩니다.

## 취약점 재현

### Step 1: alice로 로그인

1. 브라우저에서 `http://localhost:8080` 접속
2. alice / password123 입력 후 Login 클릭
3. Alice Kim의 프로필 확인 (이름, 이메일, 잔액 $15,230.00)

이 요청이 Nginx(CDN)를 통과하면서 `/api/profile` 응답이 캐시에 저장됩니다.

### Step 2: 시크릿 모드에서 확인

1. 새 시크릿 모드 창 열기 (Chrome: Ctrl+Shift+N)
2. `http://localhost:8080` 접속
3. **로그인하지 않고** 개발자 도구(F12) → Console에서 아래 코드를 실행합니다.

아래 코드를 실행하면 Nginx가 캐시한 응답을 확인할 수 있습니다.

```javascript
fetch("/api/profile").then(r => r.json()).then(console.log)
```

Console에 아래와 같이 Alice의 프로필이 출력됩니다.

```json
{"name": "Alice Kim", "email": "alice@example.com", "balance": "$15,230.00"}
```

**로그인하지 않았는데 Alice의 프로필 정보가 그대로 보입니다!**

### Step 3: 캐시 HIT 확인

개발자 도구(F12) → Network 탭에서 `/api/profile` 요청의 응답 헤더를 확인합니다.

```text
X-Cache-Status: HIT
```

`HIT`가 보이면 Nginx가 origin에 요청하지 않고 캐시된 응답을 그대로 전달한 것입니다.

## 안전한 설정으로 전환

안전한 Nginx 설정으로 전환하여 취약점이 해결되는지 확인합니다. `nginx-safe.conf`는 `proxy_cache_key`에 Cookie를 포함하여 사용자별로 캐시를 구분하는 설정입니다.

```bash
docker compose down
NGINX_CONF=./nginx/nginx-safe.conf docker compose up --build
```

같은 테스트를 반복하면 시크릿 모드에서 `401 Not authenticated` 응답을 받습니다. **캐시 키에 Cookie를 포함했기 때문에, Cookie가 없는 요청은 다른 캐시 키로 처리됩니다.**

## 종료

Docker Compose를 종료합니다.

```bash
docker compose down
```
