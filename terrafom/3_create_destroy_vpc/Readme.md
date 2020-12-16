# 개요
* vpc 생성과 삭제

# 준비
* aws 접속 정보를 환경변수로 설정
```sh
export AWS_ACCESS_KEY_ID="<AWS_ACCESS_KEY_ID>"
export AWS_SECRET_ACCESS_KEY="<AWS_SECRET_ACCESS_KEY>"
export AWS_DEFAULT_REGION="ap-northeast-2"
```

# 프로젝트 초기화
```sh
terraform init
```

# vpc 생성
```sh
terraform apply
```

![](imgs/vpc생성결과.jpg)


# vcp 삭제
```sh
terraform destroy
```


# 참고자료
* 공식문서: https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/vpc