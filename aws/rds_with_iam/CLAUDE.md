# Overview

AWS RDS에서 접근할 때 인증을 DB password로 하지 않고 IAM auth로 하는 프로젝트입니다. 이론적인 내용과 핸즈온을 합니다.

<goal>
- IAM auth로 DB인증하는 원리를 설명해야 합니다.
- IAM auth를 사용하면 장점과 단점이 무엇인지 설명해야 합니다.
- IAM auth를 사용하면 한계가 무엇인지 설명해야 합니다.
- DB인증으로 사용하고 있는데 무중단으로 IAM auth로 변경할 수 있는지도 설명해야 합니다.
- 이론도 중요하지만 런북느낌으로 핸즈온을 하는게 저의 목표입니다. 블로그, 유튜브에 업로드할 거에요. 답변 스타일은 첨부자료 중 "my_writing_OIDC.md"을 참고하세요. 저의 스타일이며 블로그에 이렇게 작성하는 편입니다.
- AWS RDS IAM auth에 대한 가이드는 첨부자료 중 "rds_iam_auth_document.pdf"에 있습니다.
</goal>

<context>
- AWS 리소스는 테라폼으로 구성합니다.
- 청중은 RDS를 압니다. 하지만 IAM auth는 전혀 모릅니다.
- flow chart, 시퀀스 다이어그램이 필요할 때는 mermaid 포맷으로 만듭니다. mermaid live view에서 렌더링이 되야 합니다.
</context>

<architecture>
- RDS, EC2 인스턴스를 사용합니다. EC2인스턴스의 파이썬 코드가 RDS로 접근하는 구조입니다.


```hcl
data "http" "my_ip" {
  url = "https://api.ipify.org?format=text"
}
```

- RDS는 postgres, mysql aurora를 사용합니다. 만약 IAM auth를 지원하지 않는 RDS가 있다면 그 RDS는 생성하지 않을거에요.
- postgres, mysql RDS 예제 스키마, 예제 테이블, 예제 데이터, 예제 계정이 필요합니다. 간단히 user 테이블을 생성하고 user 테이블에 데이터를 넣을거에요. 그리고 IAM auth에 연결할 계정도 필요합니다. 이 과정들은 postgres, mysql 각각 필요하고 각 스크립트와 가이드를 작성하세요. 스크립트는 init_mysql.sh, init_postgres.sh로 만들고, 가이드는 init_mysql.md, init_postgres.md로 만들거에요.
- EC2인스턴스에는 python 코드를 실행합니다. python 코드는 RDS에 접근할 겁니다. 이 때 database 계정은 사용하지 않을 거에요.
</architecture>

<terraform_requirements>
- ap-northeast-2를 사용합니다.
- 코드의 indent는 2입니다.
- 테라폼 디렉터리는 ./terraform입니다.
- 코드의 주석은 정말 필요하지 않으면 주석을 달지 않습니다.
- RDS, EC2인스턴스는 default vpc와 default public subnet을 사용합니다. 이 예제는 핸즈온이기 때문에 비용을 절약하기 위해 default vpc와 public subnet을 사용합니다. 단, 아무나 RDS, EC2 인스턴스에 접근할 수 있도록 default security group을 내 IP만 접근하도록 inbound를 설정합니다. 내 IP조회는 data block을 사용합니다.
- default vpc와 public subnet은 data block을 사용합니다.
- EC2인스턴스는 비용을 줄이기 위해 ARM 인스턴스를 사용합니다. 그리고 t4g.medium을 사용합니다.
- iam.tf, rds.tf, data.tf 등 목적별로 테라폼코드를 나는 것을 선호합니다.
- 테라폼속성의 변하는 것들은 테라폼 변수를 사용하세요. terraform.tfvars를 사용하고 terraform.tfvars.example를 생성하세요. terraform.tfvars는 gitignore할겁니다. gitignore가이드는 필요없어요.
- performance insight 7일을 활성화 하세요.
- 테라폼 리소스의 이름은 테라폼 리소스를 굳이 표현안해도 됩니다. 예를 들어 rds_cluster라면 name과 테라폼 리소스 이름에는 rds가 없어도 됩니다. 예를 들어 security group을 만들면 테라폼 리소스이름과 name에는 sg같은 것을 표현안해도 됩니다.
- bastion host는 필요없습니다.
- EC2인스턴스는 ssh key를 사용하지 않습니다. SSM으로 접근을 할거에요. 그래서 EC2 인스턴스 프로파일에는 SSM을 사용할 수 있도록 IAM policy를 추가해야 합니다.
- RDS는 aurora인스턴스에서 사용할 수있는 최저 스펙을 사용하고 인스턴스는 1대 사용합니다. 그리고 인스턴스 타입은 t타입입니다.
- terraform output에는 EC2 인스턴스에 SSM으로 접근하는 명령어가 있어야 합니다. 그리고 RDS 인스턴스의 엔드포인트, EC2인스턴스 public IP가 있어야 합니다.
</terraform_requirements>

<python_requirements>
- 파이썬 3.13를 사용합니다.
- 파이썬 코드는 RDS에 접근해서 데이터를 조회하고 쓰는 것입니다.
- indent는 2입니다.
- 파이썬 코드는 ./app디렉터리에 만들세요.
- 웹 화면이 있으면 좋으므로 FastAPI를 사용하고 jinja template으로 웹 화면을 작성하면 좋겠네요.
- 주석은 정말 필요하지 않으면 주석을 달지 않습니다.
- 함수 또는 class를 최대한 활용하여 읽기 쉬운 코드를 작성하세요.
- 만약 변수설정이 필요하다면 .env를 사용하도록 하세요.
</python_requirements>
