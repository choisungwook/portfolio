* alb는 AMI가 필요없고 Target Group만 필요
* TargetGroup에는 VPC, health check, listen port, security group 설정
* 리소스 이름 가져오기(여러가지 방법 존재)
```yaml
Resources:
  demo-resource:
    Tags:
    - Key: Name
      Value: !Sub ${AWS::StackName}
```
* SecurityGroup ALL 설정
```yaml
Resources:
  PublicAutoScalingSecurityGroup:
    Type: AWS::EC2::SecurityGroup
    SecurityGroupEgress:
      - IpProtocol: -1
        CidrIp: 0.0.0.0/0
```

![](images/notes_alltraffic.png)

* autoscaling을 만들 떄 필수 Tag 존재
```yaml
Resources:
  AutoScalingGroup:
    Tags:
    - Key: Environment
      Value: dev
      PropagateAtLaunch: "true"
```

![](images/notes_asg_propagate.png)