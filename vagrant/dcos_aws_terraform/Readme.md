# 개요
* aws dcos terraform을 실행하기 위한 os구축

# 설치

## ssh 키 생성
```sh
ssh-keygen -t rsa
```

## aws 설정 정보 설정
* admin role 필요
```sh
aws configure
```

* 테라폼 모듈 설치
```sh
terraform init
```

# 참고자료
* [1] [terrform version 목록](https://releases.hashicorp.com/terraform/)
* [2] [dcos terraform git](https://github.com/dcos-terraform/terraform-aws-dcos)
* [3] [블로그 dcos terraform 설치](https://www.business2community.com/cloud-computing/what-is-dc-os-02389262)