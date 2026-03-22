# CDN 캐시 위험성 핸즈온 — Agent Guide

CDN 캐시 키에 Cookie를 포함하지 않으면 다른 사용자의 개인정보가 노출되는 문제를 재현하는 프로젝트다. Docker(Nginx)와 CloudFront 두 환경에서 같은 취약점을 직접 확인할 수 있다.

- GitHub Issue: #355 (생성 완료)
- 글로벌 워크플로우는 `@../../AGENTS.md`를 따른다.

## 프로젝트 구조

```
app/            Flask 백엔드 — 의도적으로 위험한 Cache-Control 설정 포함
frontend/       정적 HTML/CSS/JS — 로그인/프로필 UI
docker/         Docker Compose + Nginx 설정 (dangerous / safe 두 버전)
terraform/      CloudFront 실습용 AWS 인프라
docs/           개념 문서(concepts.md), 실습 가이드(docker-lab.md, cloudfront-lab.md)
```

## 취약점 핵심 포인트

이 프로젝트에서 취약점을 구성하는 설정은 3곳에 분산되어 있다. 코드를 수정할 때 이 파일들의 관계를 이해해야 한다.

| 파일 | 설정 | 역할 |
|------|------|------|
| `app/app.py:56` | `Cache-Control: public, max-age=60` | Origin이 CDN에게 캐시를 허용 |
| `docker/nginx/nginx-dangerous.conf:37` | `proxy_cache_key`에 Cookie 미포함 | Nginx가 모든 사용자를 같은 캐시로 취급 |
| `terraform/cloudfront.tf:17` | `cookie_behavior = "none"` | CloudFront 캐시 키에서 Cookie 제외 |

Origin이 캐시를 허용하고(`public`), CDN이 캐시 키에 Cookie를 포함하지 않는 조합이 취약점의 원인이다. `nginx-safe.conf`는 `proxy_cache_key`에 Cookie를 포함한 안전한 버전이다.

## Used Skills

| 작업 | Skill |
|------|-------|
| 문서 작성 | `writing-with-akbunstyle` |
| 문서 리뷰 | `docs_reviewer` |
| PR 생성 | `create-github-pr` |
| 커밋 메시지 | `suggest-git-commit-message` |
