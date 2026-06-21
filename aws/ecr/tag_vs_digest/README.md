# ECR lifecycle digest hands-on

ECR tag, image digest, layer의 관계를 직접 확인합니다. 개발환경(d-*) cleanup이 운영환경(vx.x.x) tag가 붙은 image digest에 어떤 영향을 주는지도 검증합니다.

## 문서

- [문서 인덱스](./docs/README.md)
- [공통 준비](./docs/00-setup.md)
- [시나리오 1: 수동 개발환경 tag 삭제와 shared digest](./docs/01-shared-digest-tag-delete.md)
- [시나리오 2: guard 없는 lifecycle preview](./docs/02-lifecycle-dev-cleanup-without-guard.md)
- [시나리오 3: lifecycle로 개발환경(d-*) cleanup과 운영환경(vx.x.x) guard 확인](./docs/03-lifecycle-dev-cleanup-prod-guard.md)
- [시나리오 4: metadata 차이로 digest 다르게 만들기](./docs/04-metadata-digest.md)

## 파일

- [app](./app/)
- [terraform](./terraform/)
