# 개요

- 이 디렉터리는 온프레미스 리다렉트를 수행하는 nginx를, AWS로 이관하는 여러 방법을 재현하기 위한 핸즈온입니다.
- 저의 개인 도메인와 ACM을 사용했기 때문에 terraform.tfvars에서 변경이 필요합니다.
- 이론 설명: https://malwareanalysis.tistory.com/902

## 디렉터리 구조

- [ALB를 사용한 리다이렉트](./option2_alb/)
- [CloudFront를 사용한 리다이렉트](./option3_cloudfront/)
