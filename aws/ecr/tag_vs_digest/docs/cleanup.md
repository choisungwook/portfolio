# ECR lifecycle digest hands-on cleanup

## ECR repository 삭제

실습 image와 ECR repository를 삭제합니다.

```bash
cd terraform
terraform destroy
```

## 로컬 Docker image 정리

로컬 Docker image가 많이 남았다면 tag 기준으로 정리합니다.

```bash
docker image ls "$IMAGE"
docker image rm "${IMAGE}:${PROD_TAG}" || true
docker image rm "${IMAGE}:${SHARED_PROD_TAG}" || true
```

## 주의사항

`force_delete=true`는 실습 cleanup을 쉽게 하기 위한 설정입니다. production repository에서는 사용하지 않습니다.
