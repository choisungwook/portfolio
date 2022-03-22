- [cloudformation 템플릿 실행](#cloudformation-템플릿-실행)
- [cloudformation 템플릭 삭제](#cloudformation-템플릭-삭제)
- [기본 autoscaling-policy](#기본-autoscaling-policy)
- [todo](#todo)
- [기록](#기록)
- [create stack](#create-stack)
- [udpate stack](#udpate-stack)
- [VPC](#vpc)
- [subnet](#subnet)
  - [public subnet](#public-subnet)
  - [private subent](#private-subent)
- [참고자료](#참고자료)

# cloudformation 템플릿 실행
```sh
aws cloudformation create-stack --stack-namem [스택이름] --template-body [file://파일경로]
```

<br>

# cloudformation 템플릭 삭제
```sh
aws cloudformation delete-stack --stack-name [스택이름]
```

<br>

# 기본 autoscaling-policy
* ASGAverageCPUUtilization는 5분?을 대기하여 ec2 인스턴스 정책을 적용

# todo
* [ ] autoscaling threshold(기본: 300초로 추청)
  * cloudformation alarm 설정을 변경해야 하는 것으로 추측
* [ ] scalein autoscalepolicy

<br>

# 기록
* 운영입장에서는 테라폼이 안정적으로 보인다.
  * 첫 번쨰 실행 템플릿이 실패할 경우(syntax 에러 등) 삭제만 가능하다.

![](images/rollback_complete_1.png)

![](images/rollback_complete_2.png)

* 단, 테라폼은 최신 리소스 반영이 한 템포 느리다.

# create stack
```shg
aws cloudformation create-stack --stack-name [스택이름] --template-body file://[파일경로]
```

# udpate stack
```
aws cloudformation update-stack --stack-name [스택이름] --template-body file://[파일경로]
```

# VPC
> 참고자료: [AWS공식문서](https://docs.aws.amazon.com/ko_kr/AWSCloudFormation/latest/UserGuide/aws-resource-ec2-vpc.html)

```yaml
VPC:
    Type: AWS::EC2::VPC
    Properties: 
        CidrBlock: 10.0.0.0/16
        EnableDnsHostnames: true
        EnableDnsSupport: true
        InstanceTenancy: default
        Tags: 
        - Key: Name
            Value: !Join ['', [!Ref "AWS::StackName", "-VPC"]]
```

# subnet
## public subnet
```yaml
PublicSubnetA:
    Type: AWS::EC2::Subnet
    Properties: 
      AvailabilityZone: !Select [0, !GetAZs ]
      CidrBlock: 10.0.0.0/24
      MapPublicIpOnLaunch: true
      Tags: 
        - Key: Name
          Value: !Sub ${AWS::StackName}-Public-A
      VpcId: !Ref VPC
```

## private subent
```yaml
PublicSubnetA:
    Type: AWS::EC2::Subnet
    Properties: 
      AvailabilityZone: !Select [0, !GetAZs ]
      CidrBlock: 10.0.0.0/24
      MapPublicIpOnLaunch: true
      Tags: 
        - Key: Name
          Value: !Sub ${AWS::StackName}-Public-A
      VpcId: !Ref VPC
```

# 참고자료
* [1] [블로그](https://www.infoq.com/articles/aws-vpc-cloudformation/)
* [2] [custom-alarm](https://lvthillo.medium.com/aws-auto-scaling-based-on-memory-utilization-in-cloudformation-159676b6f4d6)