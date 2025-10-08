# 개요

* AWS ASG를 실습할 수 있도록 테라폼으로 환경구축
* 실습내용:
  * 한국블로그: https://malwareanalysis.tistory.com/870
  * 영어블로그: https://akbun-us.blogspot.com/2025/10/test.html

## 아키텍처

* AWS계정의 default VPC와 public subnet을 사용합니다.
* EC2인스턴스는 t4g.nano를 사용하고 userdata에서 nginx를 설치합니다.
* ALB -> ASG연동은 AWS콘솔에서 수동으로 진행해야 함

* [](./assets/arch.png)

## 생성방법

```sh
terraform apply
```

## 삭제 방법

```sh
terraform destroy
```
