# ECR lifecycle digest hands-on 디버깅 명령

## repository 전체 tag와 digest 확인

repository 전체 tag와 digest를 확인합니다.

```bash
aws ecr describe-images \
  --repository-name "$REPO_NAME" \
  --query 'sort_by(imageDetails,&imagePushedAt)[].{pushed:imagePushedAt}' \
  --output table
```

위 명령은 pushed time만 빠르게 확인하는 용도입니다. tag와 digest까지 함께 보려면 query를 다음처럼 바꿉니다.

```bash
aws ecr describe-images \
  --repository-name "$REPO_NAME" \
  --query 'sort_by(imageDetails,&imagePushedAt)[].{pushed:imagePushedAt,tags:imageTags,digest:imageDigest}' \
  --output table
```

## 특정 tag가 가리키는 digest 확인

특정 tag가 가리키는 digest를 확인합니다.

```bash
TAG=d-20260620-001

aws ecr describe-images \
  --repository-name "$REPO_NAME" \
  --image-ids imageTag="$TAG" \
  --query 'imageDetails[0].imageDigest' \
  --output text
```

## 특정 digest에 붙은 tag 목록 확인

특정 digest에 붙은 tag 목록을 확인합니다.

```bash
DIGEST=sha256:...

aws ecr describe-images \
  --repository-name "$REPO_NAME" \
  --image-ids imageDigest="$DIGEST" \
  --query 'imageDetails[0].imageTags' \
  --output json
```

## image manifest 확인

image manifest를 확인합니다.

```bash
TAG=d-20260620-001

aws ecr batch-get-image \
  --repository-name "$REPO_NAME" \
  --image-ids imageTag="$TAG" \
  --query 'images[0].imageManifest' \
  --output text
```

## lifecycle policy 확인

lifecycle policy를 확인합니다.

```bash
aws ecr get-lifecycle-policy \
  --repository-name "$REPO_NAME" \
  --query 'lifecyclePolicyText' \
  --output text
```

## lifecycle preview 확인

lifecycle preview를 확인합니다.

```bash
aws ecr start-lifecycle-policy-preview \
  --repository-name "$REPO_NAME"

aws ecr get-lifecycle-policy-preview \
  --repository-name "$REPO_NAME" \
  --query 'previewResults[].{tags:imageTags,digest:imageDigest,action:action.type,rule:appliedRulePriority}' \
  --output table
```

## tag 삭제와 digest 삭제 구분

수동 tag 삭제와 lifecycle expire는 같은 동작이 아닙니다.

`imageTag`를 지정한 `batch-delete-image`는 해당 tag를 제거합니다. 같은 image digest에 다른 tag가 남아 있으면 image는 repository에 남습니다.

개발환경 tag만 삭제합니다.

```bash
aws ecr batch-delete-image \
  --repository-name "$REPO_NAME" \
  --image-ids imageTag="$DEV_TAG"
```

`imageDigest`를 지정한 `batch-delete-image`는 image 자체와 그 image에 붙은 tag 전체에 영향을 줍니다. 그래서 이 핸즈온의 기본 경로에서는 사용하지 않습니다.

```bash
aws ecr batch-delete-image \
  --repository-name "$REPO_NAME" \
  --image-ids imageDigest="$DIGEST"
```

lifecycle policy의 `expire`도 tag 하나만 제거하는 기능이 아니라 image를 만료시키는 기능입니다. 따라서 개발환경(d-*) tag와 운영환경(vx.x.x) tag가 같은 digest를 가리키는 image가 개발환경 lifecycle expire 대상이 되면 운영환경 tag도 함께 영향을 받을 수 있습니다.

## CloudTrail에서 수동 tag 삭제 확인

`batch-delete-image imageTag=...`로 수동 tag 삭제를 실행한 뒤 CloudTrail의 `BatchDeleteImage` event를 확인합니다.

```bash
aws cloudtrail lookup-events \
  --lookup-attributes AttributeKey=EventName,AttributeValue=BatchDeleteImage \
  --max-results 20 \
  --output json \
  | jq -r --arg repo "$REPO_NAME" '
      .Events[].CloudTrailEvent
      | fromjson
      | select(.eventSource == "ecr.amazonaws.com")
      | select(.requestParameters.repositoryName == $repo)
      | {
          eventTime,
          eventName,
          requestImageIds: .requestParameters.imageIds,
          responseImageIds: .responseElements.imageIds
        }
    '
```

해석 기준은 다음과 같습니다.

- `requestImageIds`에 `imageTag`만 있으면 tag 기준 삭제 요청입니다.
- `responseImageIds`에는 삭제된 tag와 그 tag가 가리키던 `imageDigest`가 함께 나올 수 있습니다.
- 같은 digest에 다른 tag가 남아 있으면 `describe-images --image-ids imageDigest=...`에서 image가 계속 조회됩니다.

## CloudTrail에서 lifecycle preview 확인

Lifecycle preview는 CloudTrail에 `DryRunEvent`로 남습니다. 이 event는 어떤 image digest와 tag 목록이 expire 후보였는지 확인하는 용도입니다.

```bash
aws cloudtrail lookup-events \
  --lookup-attributes AttributeKey=EventName,AttributeValue=DryRunEvent \
  --max-results 20 \
  --output json \
  | jq -r --arg repo "$REPO_NAME" '
      .Events[].CloudTrailEvent
      | fromjson
      | select(.eventSource == "ecr.amazonaws.com")
      | select(.serviceEventDetails.repositoryName == $repo)
      | {
          eventTime,
          eventName,
          repositoryName: .serviceEventDetails.repositoryName,
          imageActions: [
            .serviceEventDetails.lifecycleEventImageActions[]?
            | {
                digest: .lifecycleEventImage.digest,
                tagStatus: .lifecycleEventImage.tagStatus,
                tags: .lifecycleEventImage.tagList,
                rulePriority
              }
          ],
          failureDetails: .serviceEventDetails.lifecycleEventFailureDetails
        }
    '
```

해석 기준은 다음과 같습니다.

- `imageActions[].digest`가 lifecycle expire 후보 image의 digest입니다.
- `imageActions[].tags`에 개발환경(d-*) tag와 운영환경(vx.x.x) tag가 함께 있으면 같은 digest에 두 tag가 붙어 있는 image가 expire 후보라는 뜻입니다.
- `rulePriority`로 어떤 lifecycle rule이 해당 image를 expire 후보로 잡았는지 확인합니다.

## CloudTrail에서 lifecycle 실제 expire 확인

실제 lifecycle expire는 CloudTrail에 `PolicyExecutionEvent`로 남습니다. lifecycle은 조건 충족 뒤 최대 24시간까지 걸릴 수 있으므로 즉시 보이지 않을 수 있습니다.

```bash
aws cloudtrail lookup-events \
  --lookup-attributes AttributeKey=EventName,AttributeValue=PolicyExecutionEvent \
  --max-results 20 \
  --output json \
  | jq -r --arg repo "$REPO_NAME" '
      .Events[].CloudTrailEvent
      | fromjson
      | select(.eventSource == "ecr.amazonaws.com")
      | select(.serviceEventDetails.repositoryName == $repo)
      | {
          eventTime,
          eventName,
          repositoryName: .serviceEventDetails.repositoryName,
          imageActions: [
            .serviceEventDetails.lifecycleEventImageActions[]?
            | {
                digest: .lifecycleEventImage.digest,
                tagStatus: .lifecycleEventImage.tagStatus,
                tags: .lifecycleEventImage.tagList,
                rulePriority
              }
          ],
          failureDetails: .serviceEventDetails.lifecycleEventFailureDetails
        }
    '
```

실제 삭제 여부는 ECR 조회로 한 번 더 확인합니다.

```bash
DIGEST=sha256:...

aws ecr describe-images \
  --repository-name "$REPO_NAME" \
  --image-ids imageDigest="$DIGEST"
```

`ImageNotFoundException`이 나오면 해당 digest의 image가 repository에서 사라진 것입니다. 같은 digest에 붙어 있던 운영환경(vx.x.x) tag도 더 이상 pull할 수 없습니다.
