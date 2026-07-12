# 폐쇄망 실습 환경 준비: NAT 없는 private subnet과 VPC endpoint

이 문서는 Track B의 폐쇄망 환경을 Terraform으로 만든다. 인터넷이 물리적으로 안 되는 subnet에 EC2를 두고, 운영에 필요한 통신은 VPC endpoint로만 연다. 이 환경 위에서 [10-airgapped-bedrock.md](10-airgapped-bedrock.md)가 Bedrock을 부른다.

## 무엇을 폐쇄망이라 부르나

여기서 폐쇄망은 "private subnet"보다 강한 조건이다. 보통 private subnet은 NAT gateway를 두고 아웃바운드 인터넷은 허용한다. 이 실습은 NAT도, IGW 라우트도 없앤다. 인터넷 통신이 물리적으로 불가능한 상태를 만드는 게 목적이다. 엔터프라이즈의 "인터넷이 안 되어야 한다"를 타협 없이 재현한다.

그러면 문제가 생긴다. 서버 접속도, 패키지 설치도, 컨테이너 이미지 pull도, LLM 호출도 전부 인터넷을 쓰던 일이다. 이걸 전부 VPC endpoint로 갈아끼운다. AWS 서비스로 가는 트래픽을 인터넷이 아니라 VPC 내부 사설 경로로 보내는 통로가 endpoint다.

todo-generate-image

```text
A horizontal hand-drawn whiteboard-style diagram showing how network traffic flows between
components, drawn with slightly wobbly marker lines on a clean white background, in a friendly
handwritten marker font. All text is in English.

TITLE: a short title at the top in handwritten marker font, reading exactly: "Air-gapped LiteLLM on Bedrock".

COMPONENTS:
- Application/actor components, drawn as plain rectangles with a dark (near-black) hand-drawn
  outline and white fill, each labeled inside: "EC2: LiteLLM (Docker)" on the left, and
  "Amazon Bedrock", "Amazon ECR", "AWS SSM" on the right.
- Network components (things that relay/route/proxy traffic), drawn as rectangles with an ORANGE
  (#E8870C) hand-drawn outline, each labeled inside: "bedrock-runtime endpoint", "ecr.api / ecr.dkr
  endpoint", "ssm / ssmmessages / ec2messages endpoint", "S3 gateway endpoint" (all in the middle column).

GROUPS: enclose the EC2 host and all four endpoint boxes inside one large rectangle with a thin
dark outline, labeled at the top: "Private subnet (no IGW, no NAT)". Keep "Amazon Bedrock",
"Amazon ECR", "AWS SSM" outside this box on the right, representing AWS service backends reached
privately.

FLOW (all arrows are BLACK and show traffic direction, left to right): an arrow from
"EC2: LiteLLM (Docker)" to "bedrock-runtime endpoint", then from that endpoint to "Amazon Bedrock";
an arrow from the EC2 host to "ecr.api / ecr.dkr endpoint", then to "Amazon ECR"; an arrow from the
EC2 host to "ssm / ssmmessages / ec2messages endpoint", then to "AWS SSM"; an arrow from the EC2
host to "S3 gateway endpoint" (used by ECR layers and dnf repos).

CONNECTION LABELS: write these short labels in ORANGE text next to the arrow they describe:
"HTTPS :443" on the EC2-to-endpoint arrows; "instance role creds (no API key)" on the
EC2-to-bedrock-runtime arrow; "image pull" on the EC2-to-ecr arrow; "no internet" written once in
orange near the private subnet box boundary.

HIGHLIGHT (the key application-to-network path): keep all arrows black; draw a GREEN (#2FA84F)
rounded rectangle around the "EC2: LiteLLM (Docker)" to "bedrock-runtime endpoint" path, showing
this is how an air-gapped host still reaches an LLM. Do not color any arrow green. Keep the green to
this one path so it stands out.

STYLE: clean, friendly hand-drawn whiteboard sketch, generous spacing, arrows and labels never
overlapping, very legible. 16:9 aspect ratio.

DO NOT: add any product logos or icons (components are labeled boxes only). No watermarks, no extra
UI chrome. Do not misspell the component names or labels. Do not let arrows or text overlap.
```

## endpoint 하나하나가 무슨 인터넷을 대체하나

[terraform/vpc_endpoints.tf](../terraform/vpc_endpoints.tf)가 만드는 endpoint는 각각 원래 인터넷으로 하던 일을 대신한다. 없으면 무엇이 막히는지가 이 실습의 핵심이다.

| endpoint | 없으면 막히는 것 |
|---|---|
| ssm, ssmmessages, ec2messages | EC2 접속(SSM Session Manager) |
| s3 (gateway) | AL2023 패키지 설치(dnf), ECR 이미지 layer 다운로드 |
| ecr.api, ecr.dkr | LiteLLM 컨테이너 이미지 pull |
| bedrock-runtime | LLM 호출 |

S3만 gateway endpoint이고 나머지는 interface endpoint다. AL2023을 추천하는 실질적 이유가 여기 있다. AL2023의 dnf 저장소가 리전 내 S3로 서비스되기 때문에, S3 gateway endpoint 하나만 있으면 폐쇄망에서도 `dnf install docker`가 된다. 별도 미러나 golden AMI 없이 표준 AMI로 실습이 성립한다. Bedrock은 API 서비스라 호출하는 쪽 OS에 요구사항이 없어 전용 AMI라는 것이 존재하지 않는다.

## 만들기

Terraform으로 VPC, endpoint, EC2, ECR, IAM을 한 번에 만든다. apply는 비용이 드니 먼저 plan으로 확인한다.

```bash
cd terraform
cp terraform.tfvars.example terraform.tfvars
terraform init
terraform plan
terraform apply   # 비용 발생. 실습이 끝나면 destroy 한다
```

만들어지면 접속은 SSM으로만 한다. 폐쇄망이라 bastion을 둘 public subnet 자체가 없다. 접속 명령은 output으로 나온다.

```bash
aws ssm start-session --target $(terraform output -raw instance_id) --region ap-northeast-2
```

## 이미지를 폐쇄망 안으로 들여보내기

여기서 실무자는 바로 막힌다. 폐쇄망 EC2는 ghcr.io에 못 나가는데 LiteLLM 이미지는 어떻게 넣나. 인터넷이 되는 로컬에서 이미지를 받아 private ECR에 push하고, EC2는 ECR endpoint로 pull한다. EC2가 Graviton(arm64)이므로 arm64 이미지를 받는다.

```bash
ECR=$(terraform output -raw ecr_repository_url)
aws ecr get-login-password --region ap-northeast-2 | docker login --username AWS --password-stdin "$ECR"
docker pull --platform linux/arm64 ghcr.io/berriai/litellm:v1.91.1
docker tag ghcr.io/berriai/litellm:v1.91.1 "$ECR:v1.91.1"
docker push "$ECR:v1.91.1"
```

## 정리

폐쇄망 인프라는 비용이 계속 나가므로 실습이 끝나면 반드시 내린다.

```bash
cd terraform && terraform destroy
```

## 다음

환경이 준비됐으면 이 폐쇄망 안에서 Bedrock을 부르는 [10-airgapped-bedrock.md](10-airgapped-bedrock.md)로 넘어간다.
