# 개요
* ec2 keypair, security group, ec2 생성

# 준비
## aws 접속 정보를 환경변수로 설정
```sh
export AWS_ACCESS_KEY_ID="<AWS_ACCESS_KEY_ID>"
export AWS_SECRET_ACCESS_KEY="<AWS_SECRET_ACCESS_KEY>"
```

## 공개키/비밀키 키 페어 생성
```sh
ssh-keygen -t rsa -b 4096 -f "$HOME/.ssh/aws" -N ""
```

![](imgs/create_keypair.jpg)

# security group
* ssh 포트 헝9ㅛㅇ

# 실행
```sh
terraform apply
```

![](imgs/result.jpg)

# 참고자료
* [1] 블로그: https://www.44bits.io/ko/post/terraform_introduction_infrastrucute_as_code#%ED%85%8C%EB%9D%BC%ED%8F%BC-%EC%84%A4%EC%B9%98
* [2] terraform 공식문서-security group: https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/security_group
* [3] terraform 공식문서-ec2 instance: https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/instance
* [4] terraform 공식문서-ami: https://registry.terraform.io/providers/hashicorp/aws/latest/docs/data-sources/ami