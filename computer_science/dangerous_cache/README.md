# CDN 캐시 정책의 위험성 - 다른 사람의 개인정보가 보이는 문제

## 목차

- [해결하려는 문제](#해결하려는-문제)
- [이 글을 읽고 답할 수 있는 질문](#이-글을-읽고-답할-수-있는-질문)
- [문서 구성](#문서-구성)
- [결론](#결론)
- [참고자료](#참고자료)

## 해결하려는 문제

CDN은 정적 컨텐츠(CSS, JS, 이미지)를 캐싱하도록 기본 설계되어 있습니다. 그런데 API 응답까지 캐시하면서 캐시 키에 Cookie를 포함하지 않으면 어떤 일이 벌어질까요?

**사용자 A의 개인정보가 사용자 B에게 그대로 노출됩니다.** 이 핸즈온은 이 위험한 상황을 직접 재현하고, 왜 발생하는지 원인을 분석합니다.

이 문제는 CloudFront뿐만 아니라 모든 CDN에서 발생할 수 있습니다. 두 가지 환경에서 실습할 수 있습니다.

- **Docker 실습**: Nginx를 CDN으로 사용하여 로컬에서 재현 (AWS 불필요)
- **CloudFront 실습**: Terraform으로 실제 AWS 환경을 구성하여 재현

## 이 글을 읽고 답할 수 있는 질문

1. CDN의 캐시 키(Cache Key)란 무엇이고, 기본값은 어떻게 구성되나요?
2. CDN이 정적 컨텐츠 캐싱에 최적화된 이유는 무엇인가요?
3. 캐시 키에 Cookie를 포함하지 않으면 왜 다른 사용자의 정보가 노출되나요?
4. 사용자별 응답을 반환하는 API에서 캐시 문제를 해결하는 방법 3가지는 무엇인가요?

## 문서 구성

| 문서 | 분류 | 설명 |
|------|------|------|
| [CDN 캐시 개념과 위험성](docs/concepts.md) | 이론 | CDN 캐시 동작 원리, 왜 위험한지, 원인 분석, 해결 방법 |
| [Docker 실습](docs/docker-lab.md) | 실습 | Docker + Nginx로 CDN 캐시 취약점 재현 (AWS 불필요) |
| [CloudFront 실습](docs/cloudfront-lab.md) | 실습 | Terraform으로 CloudFront 인프라 배포 + 취약점 재현 |

## 결론

CDN의 기본 캐시 키는 URL 경로만 사용합니다. 정적 컨텐츠에는 문제없지만, 사용자별 응답을 반환하는 API에 이 기본값을 그대로 적용하면 개인정보 유출로 이어집니다. **CDN 캐시 정책을 설정할 때는 "이 응답이 모든 사용자에게 같은가?"를 반드시 확인해야 합니다.**

## 참고자료

- [CloudFront 캐시 키 제어 공식 문서](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/controlling-the-cache-key.html)
- [캐시 키 이해하기](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/understanding-the-cache-key.html)
- [관리형 캐시 정책 사용하기](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/using-managed-cache-policies.html)
