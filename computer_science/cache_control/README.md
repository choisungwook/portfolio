# Cache-Control 디렉티브별 동작 비교

## 개요

Cache-Control 헤더가 CDN뿐 아니라 브라우저 캐시까지 제어한다는 점을 실습으로 확인합니다. max-age, s-maxage, no-cache, no-store, public, private, ETag 기반 validation을 AWS CloudFront 환경에서 비교합니다.

- 블로그 정리: https://malwareanalysis.tistory.com/908

## 이 글을 읽고 답할 수 있는 질문

1. Cache-Control은 무엇이고 어떤 곳에 영향을 받고, Cache control 설정은 누가 정할까요?
2. max-age와 s-maxage의 차이는 무엇인가요?
3. no-cache와 no-store의 차이는 무엇인가요?
4. CDN Invalidation을 해도 캐시가 남아있는 이유는 무엇인가요?
5. 브라우저는 캐시를 어떻게 validation(재검증)하나요?

## 문서 목차

| 문서 | 분류 | 설명 |
|------|------|------|
| [CloudFront 실습](docs/cloudfront-lab.md) | 실습 | Terraform으로 CloudFront + S3 배포, S3 캐시 정책별 동작 비교 |

## 참고자료

- [토스 기술블로그 - 웹 서비스 캐시 똑똑하게 다루기](https://toss.tech/article/smart-web-service-cache)
- [MDN - Cache-Control](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Cache-Control)
