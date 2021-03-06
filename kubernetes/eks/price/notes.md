# EC2 인스턴스 비용 계산

## 부분결제 비용
* 인스턴스 유형: t3.xlarge
* 기간: 1년
* 선결제: $524
* 월요금: $36 

![](imgs/buyinstance.png)
출처: aws 예약 인스턴스 주문 시 나오는 창

<br>

![](imgs/monthly.png)

[출처: aws 공식문서-예약 인스턴스 요금](https://aws.amazon.com/ko/ec2/pricing/reserved-instances/pricing/)

<br>

## EC2 인스턴스 사양
* CPU: 4 core
* 메모리: 16GB

![](imgs/instance.png)

[출처: aws 공식문서-ec2 instance](https://aws.amazon.com/ko/ec2/instance-types/)

<br>

## pod 갯수
* 58개

![](imgs/numberOfpods.png)

[출처: aws github](https://github.com/awslabs/amazon-eks-ami/blob/master/files/eni-max-pods.txt)

<br>

## 적용방법
* 결제 시 즉시 적용

[출처: aws 공식문서](https://github.com/awslabs/amazon-eks-ami/blob/master/files/eni-max-pods.txt)