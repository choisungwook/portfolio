# 개요
* VPC와 subnet생성

# 준비
* aws 접속 정보를 환경변수로 설정
```sh
export AWS_ACCESS_KEY_ID="<AWS_ACCESS_KEY_ID>"
export AWS_SECRET_ACCESS_KEY="<AWS_SECRET_ACCESS_KEY>"
```

# 실행결과
* vpc
![](imgs/vpc_result.jpg)

* subnet
![](imgs/subent_result.jpg)

# 참고자료
* 블로그: https://rampart81.github.io/post/vpc_confing_terraform/
* terrform공식문서-subnet: https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/subnet