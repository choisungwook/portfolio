# aws login 핸즈온

2025년 11월에 공개된 `aws login` 명령어로 Access Key 없이 AWS CLI를 인증하는 핸즈온 프로젝트.

## 핵심 개념

- `aws login`은 OAuth2 Authorization Code Flow + PKCE로 동작한다
- IAM User에 `signin:AuthorizeOAuth2Access`, `signin:CreateOAuth2Token` 권한이 필수다
- AWS CLI v2.32.0 이상 필요
- IAM Identity Center(SSO)와는 다른 별개 기능이다

## Used Skills

- `writing-with-akbunstyle`: 한국어 문서 작성
- `docs_reviewer`: 커밋 전 문서 품질 확인
