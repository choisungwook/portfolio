# 목표

VPN의 이론을 공부하고 누군가에세 설명할만큼 공부하는 것입니다. 공부한 내용을 가지고 다른 회사와 네트워크 연결할 때 커뮤니케이션에 활용할겁니다. 저는 AWS를 다루고 커뮤티케이션할때도 제 입장에서는 AWS입장입니다. 그리고 핸즈온을 할겁니다.

<context>
다른 회사의 한국 보안법때문에 공중망 VPN통신을 하려고 합니다. 다른 회사는 온프레미스이고 저의 제품은 AWS로 되어 있습니다. 저는 AWS, vpc, EKS 등은 잘 알지만 VPN을 잘 모릅니다. 그래서 다른회사 인프라팀과 VPN 논의 또는 토론을 하기 위해 VPN프로토콜을 공부하려고 합니다. VPN은 AWS Site to Site VPN을 기준으로 공부해야되고 단순히 구축이 아니라 VPN프로토콜을 알아야합니다. IPSec 등을 알아야하고 어떤게 필요하고 운영관점에서 어떻게 필요한지 알아야합니다. AWS Site to Site VPN은 maintaince가 자주 일어나기 때문에 운영관점에서 이야기해볼려고 합니다. 그리고 이중터널, ECMP프로토콜 등의 원리도 궁금하고어떻게 이야기해야하는지 궁금합니다.
</context>

<instruction>
제가 어떻게 공부해야할지 가이드를 주세요. 핸즈온은 AWS 리소스를 사용합니다. 만약에 AWS VPC, 제 로컬 PC(MacOS) 시나리오가 가능하면 이렇게도 가이드를 주세요. MacOS에서는 kind-cluster도는 docker-compose를 사용하면 좋습니다.
공부 분략은 주말 토,일요일에 할것이고 저의 스타일로 이론을 정리하는시간과 핸즈온 시간이 필요하므로 8시간 공부분량이 적당할 것 같아요.
</instruction>

<requirements>
- 핸즈온을 위한 aws리소스는 테라폼으로 구성합니다. 테라폼은 ap-northeast-2리전을 사용합니다. 테라폼 코드의 indent는 2입니다. 주석은 중요하지 않으면 달지 말세요. 테라폼 변수를 적극적으로 사용하세요. vpc는 aws vpc module를 사용하는게 좋겠어요. nat gateway는 비용때문에 최소한만 사용하세요. 인스턴스가 필요한 경우 graviton t3.small정도 사용하고 필요하다면 medium, large까지만 사용하세요. aws tag도 다세요.
- AWS site to site VPN은 vpn-concentrator로 만드세요. 참고자료: https://docs.aws.amazon.com/vpn/latest/s2svpn/vpn-concentrator.html
- 테라폼은 terraform 디렉터리에 만드세요.
- 테라폼은 모듈로 두개 만드세요. aws_cloud과 onpremise입니다.
- 옵션들은 최대한 변수로 정의하시고, 모듈은 변수를 사용하세요.
- EC2인스턴스는 t4g타입을 사용하세요. 비용을 아끼기 위해서입니다. 만약 온프레미스에서 VPN실습에 graviton이 어려우면 t4g는 t3으로 대체할 수 있습니다.
</requirements>

<limitation>
- git 명령어를 사용하지 마세요.
- terraform apply를 하지 마세요.
</limitation>
