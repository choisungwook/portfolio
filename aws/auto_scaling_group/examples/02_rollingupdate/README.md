# 개요

* AWS ASG를 활용한 RollingUpdate 예제입니다.

## 아키텍처

* AWS계정의 default VPC와 public subnet을 사용합니다.
* EC2인스턴스는 t4g.nano를 사용하고 userdata에서 nginx를 설치합니다.
* ALB -> ASG연동은 AWS콘솔에서 수동으로 진행해야 함

* [](../01_basic/assets/arch.png)

## 생성방법

```sh
terraform apply
```

## 삭제 방법

```sh
terraform destroy
```

## RollingUpdate 배포 방법

* launch tempalte 수정 후, 인스턴스 새로고침 API호출

```sh
aws autoscaling start-instance-refresh \
  --auto-scaling-group-name example2-rollingupdate \
  --desired-configuration '{
    "LaunchTemplate": {
      "LaunchTemplateId": "lt-04674a4e772d0e5cf",
      "Version": "2"
    }
  }' \
  --preferences '{
      "MinHealthyPercentage": 50,
      "MaxHealthyPercentage": 110
    }'
```
