# 개요

* 이 프로젝트는 codebuild용 github action을 사용한 springboot 빌드 시나리오 입니다.

## context

저는 github action 사용해서 github repo에 있는 springboot를 빌드할려고 합니다. 문제는 springtboot에서 사용하는 일부 라이브러리가 회사 라이브러리고, 이 라이브러리는 회사 내부망에서만 접근이 가능합니다. 그래서 저는 codebuild용 github action을 prviate subnet실행하고 Direct connect를 통해 회사 내부 저장소에 접근하려고 합니다.

* 저는 codebuid용 github action을 한번도 실행안해봤습니다.
* network vpc에 Direct connect가 있고, 이 Direct connect는 회사 내부로 접근할 수 있습니다.
* service vpc는 network vpc와 VPC peering되어 있습니다.
* service vpc에 codebuild를 실행하고, 이 codebuild는 회사 내부 nexus같은 라이브러리 저장소에 접근해야 합니다.
* springbooto는 maven으로 패키지를 관리합니다. 저는 maven을 잘 모릅니다.
* 사내망에 테스트할 수 없으니 제 개인 AWS계정에 codebuild github action을 테스트해볼겁니다.
  * 시나리오는 public IP가 있는 nexus를 생성하고 nexus에 springboot에서 사용할 라이브러리를 업로드할거에요. public IP가 있는 이유는 제가 만든 예제 라이브러리를 제 PC에서 업로드하기 위해서입니다. 단, github action에서는 EC2 private IP 또는 private route53 hostzone record로 접근할거에요. 그래야만 이 프로젝트의 codebuild github action이 의미가 있어서요. 실제 운영에서는 public IP nexus가 없을거지만 이건 개인 학습목적이기 때문에 public IP nexus를 사용할겁니다. 여기서 헷갈리지 말거는 public subnet에 EC2가 있는것은 아니고 public ALB가 있다는 소리에요.
  * 이 라이브러리는 단순히 stdout으로 Hello. Welcome이라는 문자열을 출력합니다. sprinboot maven 설정에서는 이 라이브러리를 nexus에서 다운로드 받아야됩니다. 단 github action에서는 EC2 private IP 또는 private route53 hostzone record로 접근합니다.
  * 결국 이 시나리오를 테스트하기 위해서는 2개의 자바 프로젝트가 만들어집니다. 단순히 stdout으로 Hello. Welcome이라는 문자열을 출력하는 자바 프로젝트와 springboot입니다.
  * 저는 nexus에 자바 프로젝트를 업로드하는 방법을 모릅니다.

## requirements

* 모든 code indent는 2입니다.
* 정말 필요한 주석말고는 주석을 달지 마세요.
* 테라폼 코드는 ./terraform 디렉터리에 생성하세요.
* 테라폼 코드는 variables.tf를 적극적으로 사용해야 합니다. 변할 수 있는 값은 테라폼 변수를 생성해주세요.
* 테라폼 코드는 _modules에 모듈을 만들고 이 모듈을 사용하는 코드가 있어야 합니다. 이렇게 사용하는 이유는 재사용성과 유지보수를 위해서입니다.
* 테라폼 name필드에는 리소스 이름이 있으면 안좋습니다. 예) security group name을 example-sg로 하지말고 example
* AWS에 프로비저닝하는 경우 ap-northeast-2 리전을 사용합니다.
* EC2를 사용하는 경우 EBS encryptoin을 활성화하세요.
* 이 예제는 개인 학습목적이므로 최대한 비용이 덜나오게 설정을 해야 합니다. 예) graviton사용, t3.medium 사용 등
* terraform AWS VPC module을 사용하여 VPC를 구성합니다.
  * VPC module: https://registry.terraform.io/modules/terraform-aws-modules/vpc/aws/latest
  * name: github-action
  * NAT gateway는 1개만 생성
  * enable_vpn_gateway는 필요없습니다.
* nexus에 업로드할 자바 코드는 applications/java_modules에 만들어주세요.
* springboot는 제가 만들게요. springboot코드는 만들지 마세요.
* nexus는 EC2로 생성할거에요.
  * EC2 userdata를 잘 만들어주시고 userdata는 userdata.sh로 설정하게 해주세요. AL2023을 사용하므로 dnf를 사용해야합니다. userdata에는 nexus 비밀번호를 설정하는 로직이 있어야되요. userdata는 가독성과 유지보수 쉽게 만들어주세요.
  * 로컬에서 nexus에 접근할 때는 EC2 public IP가 아니라 ALB public IP로 접근할거에요. 따라서 EC2는 ALb에서만 접근을 해야하고, ALB는 security group에 설정된 inbound만 접근 가능합니다. ALb security group inbound를 설정하도록 변수를 잘 설정해주세요. 이 security group에는 저의 집 공유 IP, vpc cidr등을 설정할거에요. Ec2 security group inbound에서는 ALB security group을 chaining해야 합니다.
  * codebuild가 nexus에 접근할 수 있도록 private Route hostonze과 private ALB를 만들어주세요. private ALB security group inbound는 vpc에서만 접근하도록 하세요. prviate route 53은 internal.com으로 만들고, nexus 도메인은 nexus.internal.com으로 만들게요.
  * nexus는 codebuild(private subnet)과 로컬에서(public subnet)에서 잘실행되도록 maven 설정을 해야 합니다. 가이드도 마찬가지로요.
  * nexus는 private subent에 위치합니다. ALB는 public subent에 위치합니다.
  * 저는 route53 public hostzone와 ACM을 가지고 있습니다. 따라서 ALB에 저의 도메인과 ACM을 설정할거에요. 그리고 listner는 443만 허용하도로 할거에요. Route53, ACM은 data로 참조하게하고 변수로 필요한 값을 설정하도록 하세요.
  * AL2023 ami를 사용하고 data필드로 ami를 사용하세요.
  * EC2는 ssh 키를 만들지 마세요. SSM으로 제가 접속할거에요.
* nexus.md라는 마크다운을 만들어주세요.
  * nexus 비밀번호 변경을 하는 가이드를 만들어주세요.
  * 제 pc에서 자바 프로젝트를 nexus 저장소에 업로드하기 위한 과정을 자세히 써주세요.
  * springboot에서 어떻게 nexus를 보고 라이브러리를 다운로드 할 수 있는지 과정을 자세히 써주세요.
* 테라폼 디렉터리 구조

```sh
.
├── terraform/
│   ├── _modules/
│   │   ├── alb.tf
│   │   ├── ec2.tf
│   │   ├── variables.tf
│   │   └── outputs.tf
│   ├── vpc.tf
│   ├── nexus.tf
│   ├── variables.tf
│   ├── outputs.tf
│   ├── codebuild.tf
│   ├── provider.tf
│   └── terraform.tfvars.example # Terraform 변수 예시
├── applications/
│   └── java_modules/
│       └── welcome-lib/     # 예제 Java 라이브러리
└── nexus.md                 # Nexus 사용 가이드
```

* 문서(markdown 등)에 도메인을 표시할때는 nexus.example.com를 사용하세요.

* codebuild.tf에 github action을 실행하는 codebuild를 생성해주세요.
  * 변수로 github Repository URL, codebuild connector를 입력받으세요. codebuild connector는 테라폼으로 만드지 않습니다. Use override credentials for this project only옵션을 체크해야 변수에 connector를 사용할 수 있습니다
  * codebuild는 nexus EC2인스턴스와 같은 private subnet에 위치합니다. codebuild가 nexus에 접근할때는 prviate route host zone을 사용하고 nexus.internal.com을 사용합니다.
  * github workflows디렉터리에 workflow파일을 만들어주세요. 조건은 github 경로기준으로 /aws/codebuild/github_action/applications/springboot_app/codebuild가 변경되고 pull request가 merge될떄입니다. 내용은 maven build를 하는겁니다. 예시)

```yaml
name: Hello World
on: [push]
jobs:
  Hello-World-Job:
    runs-on:
      - codebuild-test-${{ github.run_id }}-${{ github.run_attempt }}
    steps:
      - run: echo "Hello World"
```
