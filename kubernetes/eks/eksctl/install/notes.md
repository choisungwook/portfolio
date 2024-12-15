# eks 설치에 필요한 것
* vpc
  * subnet
  * route table
  * internet gateway
* security group
* IAM: 다른 AWS 리소스 호출을 위한 설정
    * control plane
    * worker group


# 확인 필요
* [ ] subnet은 AZ당 하나씩 생성된다.
* [ ] public, private subnet을 따로따로 구성해야 한다?
* [ ] IAM Role
* [ ] ec2가 어디 서브넷에 존재하는지 어떻게 확인하지?
NAT Gateway가 만들어진다고?
prviate은?


master vpc와 워커 노드 vpc가 따로 존재하는 듯
워커노드는 manged nodes, slef-manages nodes, fargate

# 자료조사
* eksctl를 생성하면 새로운 VPC를 생성한다.
* aws에서는 eks설치를 위한 cloudformation vpc를 제공한다.
* aws eksctl IAM rule
  * AmazonEKSClusterPolicy


# 용어 정리
* node group: 워커 노드를 그룹으로 묶어서 관리


# 참고자료
* [1] [블로그-eks 설치](https://kscory.com/dev/aws/eks-setup)
* [2] [eksctl공식문서](https://github.com/weaveworks/eksctl/tree/main/examples)
