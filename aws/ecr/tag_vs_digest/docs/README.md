# ECR lifecycle digest hands-on 문서

## TL;DR

이 핸즈온의 목표는 ECR에서 tag, image digest, layer를 분리해 이해하는 것입니다.

가장 먼저 구분할 것은 수동 tag 삭제와 lifecycle expire입니다. `batch-delete-image imageTag=...`는 지정한 tag를 제거합니다. 같은 digest에 다른 tag가 남아 있으면 image는 계속 남습니다. 반대로 lifecycle policy의 `expire`는 tag 삭제가 아니라 image 만료입니다. 따라서 개발환경(d-*) tag와 운영환경(vx.x.x) tag가 같은 digest를 가리키는 image가 낮은 우선순위 guard 없이 개발환경 cleanup 대상이 되면 운영환경 tag도 함께 사라질 수 있습니다.

개발환경(d-*) tag는 최신 10개만 lifecycle로 남깁니다. 운영환경(vx.x.x) tag가 붙은 image digest는 낮은 우선순위의 개발 cleanup rule이 삭제하지 못하게 재현합니다.

핵심은 ECR lifecycle의 `rulePriority`입니다. 숫자가 작을수록 우선순위가 높습니다. 운영환경(vx.x.x) rule을 `rulePriority=1`, `countNumber=9999`로 먼저 둡니다. 개발환경(d-*) rule은 `rulePriority=2`, `countNumber=10`으로 둡니다.

주의할 점은 ECR lifecycle에는 `keep` action이 없다는 것입니다. 운영환경(vx.x.x) rule도 문법상 action은 `expire`입니다. 다만 `countNumber=9999`로 사실상 만료 대상이 되지 않게 만들고, 더 낮은 우선순위 개발환경(d-*) cleanup rule이 운영환경 tag가 붙은 image를 expire하지 못하게 하는 guard로 사용합니다.

## AWS 공식 문서 근거

ECR lifecycle policy는 repository 안의 image를 expire 대상으로 고릅니다. lifecycle preview와 실제 lifecycle 실행은 CloudTrail에 남으며, CloudTrail event의 `serviceEventDetails.lifecycleEventImageActions[].lifecycleEventImage.digest`와 `tagList`로 어떤 digest와 tag 묶음이 대상이었는지 확인합니다.

수동 삭제 API인 `BatchDeleteImage`는 `imageTag`를 지정하면 tag 제거, `imageDigest`를 지정하면 해당 image와 tag 전체 삭제로 동작합니다. 따라서 수동 tag 삭제 시나리오와 lifecycle expire 시나리오를 같은 동작으로 보면 안 됩니다.

Lifecycle rule priority는 모든 rule을 먼저 평가한 뒤 priority 순서로 적용합니다. 높은 priority rule에 matching된 image는 낮은 priority rule로 expire되지 않습니다. 이 핸즈온의 운영환경(vx.x.x) guard는 이 규칙을 이용합니다.

## 문서 순서

| 문서 | 내용 |
| --- | --- |
| [00-setup.md](./00-setup.md) | 전제, 개념, Terraform, 공통 환경 변수 |
| [01-shared-digest-tag-delete.md](./01-shared-digest-tag-delete.md) | 같은 digest에 개발환경 tag와 운영환경 tag를 붙이고 수동으로 개발환경 tag만 삭제 |
| [02-lifecycle-dev-cleanup-without-guard.md](./02-lifecycle-dev-cleanup-without-guard.md) | guard 없는 개발환경(d-*) lifecycle preview로 shared digest가 위험해지는지 확인 |
| [03-lifecycle-dev-cleanup-prod-guard.md](./03-lifecycle-dev-cleanup-prod-guard.md) | 운영환경(vx.x.x) guard 적용 후 shared digest가 보호되는지 확인 |
| [04-metadata-digest.md](./04-metadata-digest.md) | 같은 코드에서 metadata 차이로 digest가 달라지는지 확인 |
| [debugging.md](./debugging.md) | tag, digest, manifest, lifecycle preview 확인 명령 |
| [cleanup.md](./cleanup.md) | ECR repository와 로컬 Docker image 정리 |

## 운영 적용 주의사항

- lifecycle actual expire는 즉시 실행된다고 가정하지 않습니다. preview로 먼저 검증합니다.
- 운영 repository에 적용하기 전 반드시 lifecycle preview 결과를 PR 또는 승인 기록에 남깁니다.
- 운영환경(vx.x.x) `countNumber=9999`는 운영 image 삭제 목적이 아니라 guard 목적입니다.
- 운영환경(vx.x.x) image 개수가 9999에 접근하면 lifecycle이 운영 image를 expire할 수 있으므로 알람 또는 정기 점검이 필요합니다.
- production repository에서는 `force_delete=true`를 쓰지 않습니다.
- 실제 Spring Boot buildpack pipeline에서는 image label 주입 옵션을 확인해야 합니다.

## 참고자료

- [AWS ECR lifecycle policies](https://docs.aws.amazon.com/AmazonECR/latest/userguide/LifecyclePolicies.html)
- [AWS ECR lifecycle policy properties](https://docs.aws.amazon.com/AmazonECR/latest/userguide/lifecycle_policy_parameters.html)
- [AWS ECR lifecycle policy examples](https://docs.aws.amazon.com/AmazonECR/latest/userguide/lifecycle_policy_examples.html)
- [AWS ECR retagging an image](https://docs.aws.amazon.com/AmazonECR/latest/userguide/image-retag.html)
- [AWS CLI batch-delete-image](https://docs.aws.amazon.com/cli/latest/reference/ecr/batch-delete-image.html)
- [AWS ECR API BatchDeleteImage](https://docs.aws.amazon.com/AmazonECR/latest/APIReference/API_BatchDeleteImage.html)
- [AWS ECR CloudTrail logging](https://docs.aws.amazon.com/AmazonECR/latest/userguide/logging-using-cloudtrail.html)
