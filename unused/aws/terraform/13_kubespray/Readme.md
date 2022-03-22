- [목표](#목표)
- [설정](#설정)
  - [리전 변경](#리전-변경)
  - [az변경](#az변경)
  - [vpc IP변경](#vpc-ip변경)
  - [subnet IP변경](#subnet-ip변경)
- [준비](#준비)
- [실행](#실행)
- [삭제](#삭제)

# 목표
* aws에서 kubepray 설치를 위한 인프라 구성.

<br>

# 설정
## 리전 변경
```
provider "aws" {
  region = "us-east-2"
}
```

## az변경
```
variable "az" {
  type        = list(string)
  default     = [
      "us-east-2a",
      "us-east-2b",
      "us-east-2c",

  ]
  description = "ohio region az"
}
```

## vpc IP변경
* cidr_block 변경
```
resource "aws_vpc" "demo-vpc" {
    cidr_block = "10.0.0.0/16"

    tags = {
        Name = "demo-vpc"
    }
}
```

## subnet IP변경
* default ip변경(public, private)
```
variable "public_subnet" {
  type        = list(string)
  default     = [
    "10.0.0.0/24",
    "10.0.1.0/24",
    "10.0.2.0/24"
  ]

  description = "demo public subnet"
}

variable "private_subnet" {
  type        = list(string)
  default     = [
    "10.0.3.0/24",
    "10.0.4.0/24",
    "10.0.5.0/24",
  ]
  description = "demo private subnet"
}
```

<br>

# 준비
* 테라폼 설치
* aws 접속 정보를 환경변수로 설정
```sh
export AWS_ACCESS_KEY_ID="<AWS_ACCESS_KEY_ID>"
export AWS_SECRET_ACCESS_KEY="<AWS_SECRET_ACCESS_KEY>"
```

# 실행
```sh
terraform init
terraform apply
```

<br>

# 삭제
```sh
terraform destroy
```
