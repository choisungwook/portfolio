---
paths:
  - computer_science/dangerous_cache/
---

# Cache-Control 디렉티브별 동작 핸즈온 — Agent Guide

Cache-Control 헤더가 브라우저와 CDN 캐시를 어떻게 제어하는지 디렉티브별로 비교하는 프로젝트다. AWS CloudFront + S3 환경에서 실습한다.

- GitHub Issue: #356
- 글로벌 워크플로우는 `@../../AGENTS.md`를 따른다.

## 프로젝트 구조

```
s3-objects/     S3에 업로드할 HTML 파일 (오브젝트별 다른 Cache-Control 메타데이터)
terraform/      CloudFront + S3 인프라
docs/           개념 문서, Docker 실습, CloudFront 실습 가이드
```

## Used Skills

| 작업 | Skill |
|------|-------|
| 문서 작성 | `writing-with-akbunstyle` |
| 문서 리뷰 | `docs_reviewer` |
| PR 생성 | `create-github-pr` |
| 커밋 메시지 | `suggest-git-commit-message` |
| Terraform | `terraform-style` |
