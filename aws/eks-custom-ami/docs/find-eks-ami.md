# EKS Optimized AMI 찾는 방법

## 목차

- [방법 1: SSM Parameter Store](#방법-1-ssm-parameter-store)
- [방법 2: AWS CLI describe-images](#방법-2-aws-cli-describe-images)
- [방법 3: AWS 콘솔](#방법-3-aws-콘솔)
- [Packer source_ami_filter와의 관계](#packer-source_ami_filter와의-관계)
- [결론](#결론)
- [참고자료](#참고자료)

## 방법 1: SSM Parameter Store

가장 간단한 방법입니다. AWS가 SSM Parameter Store에 최신 EKS AMI ID를 공개 파라미터로 게시합니다.

아래 명령어로 EKS 1.35 AL2023 x86_64 AMI ID를 조회할 수 있습니다.

```bash
aws ssm get-parameter \
  --name /aws/service/eks/optimized-ami/1.35/amazon-linux-2023/x86_64/standard/recommended/image_id \
  --query 'Parameter.Value' --output text \
  --region ap-northeast-2
```

경로 패턴은 이렇습니다.

```
/aws/service/eks/optimized-ami/{eks_version}/{ami_type}/recommended/image_id
```

ami_type별 경로는 다음과 같습니다.

| ami_type | 설명 |
|---|---|
| `amazon-linux-2023/x86_64/standard` | AL2023 x86_64 |
| `amazon-linux-2023/arm64/standard` | AL2023 ARM64 (Graviton) |
| `amazon-linux-2023/x86_64/neuron` | AL2023 Neuron (ML 워크로드) |

어떤 경로가 있는지 모르겠으면 하위 경로를 탐색하면 됩니다.

```bash
aws ssm get-parameters-by-path \
  --path /aws/service/eks/optimized-ami/1.35/ \
  --region ap-northeast-2
```

## 방법 2: AWS CLI describe-images

AMI 이름 패턴으로 직접 검색하는 방법입니다. AMI 이름, 생성 날짜 같은 상세 정보가 필요할 때 유용합니다.

아래 명령어로 가장 최근 AMI 정보를 조회할 수 있습니다.

```bash
aws ec2 describe-images \
  --owners amazon \
  --filters "Name=name,Values=amazon-eks-node-al2023-x86_64-standard-1.35-*" \
  --query 'Images | sort_by(@, &CreationDate) | [-1].[ImageId,Name,CreationDate]' \
  --output table \
  --region ap-northeast-2
```

### EKS AMI 이름 패턴은 어떤 규칙을 따르나요?

**EKS optimized AMI 이름은 `amazon-eks-node-al2023-{arch}-standard-{eks_version}-v{YYYYMMDD}` 패턴을 따릅니다.**

예시: `amazon-eks-node-al2023-x86_64-standard-1.35-v20260115`

이 패턴을 알면 `describe-images` 필터에 와일드카드(`*`)를 붙여서 특정 EKS 버전의 모든 AMI를 검색할 수 있습니다.

## 방법 3: AWS 콘솔

CLI가 익숙하지 않다면 콘솔에서도 찾을 수 있습니다.

1. EC2 콘솔 > AMIs > Public images 선택
2. 필터에 `amazon-eks-node-al2023-x86_64-standard-1.35` 입력
3. Owner가 `amazon`인 것 확인

## Packer source_ami_filter와의 관계

그런데 Packer를 쓰면 AMI를 직접 찾을 필요가 없지 않을까요?

맞습니다. Packer의 `source_ami_filter`는 방법 2(describe-images)와 같은 방식으로 AMI를 자동으로 찾습니다. `most_recent = true`를 설정하면 가장 최신 AMI를 선택합니다.

아래는 Packer 템플릿에서 사용하는 필터 설정입니다.

```hcl
source_ami_filter {
  filters = {
    "name"                = "amazon-eks-node-al2023-x86_64-standard-${var.eks_version}-*"
    "virtualization-type" = "hvm"
    "root-device-type"    = "ebs"
  }
  owners      = ["amazon"]
  most_recent = true
}
```

**하지만 Packer 빌드 전에 방법 1이나 2로 AMI가 존재하는지 먼저 확인하면, `source_ami_filter`에서 AMI를 못 찾는 오류를 미리 잡을 수 있습니다.** 특히 새 EKS 버전이 나왔을 때, 해당 리전에 AMI가 아직 배포되지 않았을 수 있기 때문입니다.

## 결론

EKS AMI를 찾는 방법은 3가지인데, 빠르게 ID만 확인하려면 SSM Parameter Store, 상세 정보가 필요하면 `describe-images`를 쓰면 됩니다. Packer가 자동으로 찾아주지만, 빌드 실패 시 디버깅을 위해 직접 확인하는 방법을 알아두면 시간을 아낄 수 있습니다.

## 참고자료

- <https://docs.aws.amazon.com/eks/latest/userguide/retrieve-ami-id.html>
- <https://docs.aws.amazon.com/systems-manager/latest/userguide/parameter-store-public-parameters-eks.html>
- <https://developer.hashicorp.com/packer/integrations/hashicorp/amazon/latest/components/builder/ebs>
