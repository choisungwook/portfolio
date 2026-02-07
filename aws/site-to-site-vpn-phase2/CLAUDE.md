# Objective

The goal is to study the theoretical foundations of VPNs to a level where I can explain them to others. This knowledge will be used for professional communication when establishing network connections with external companies. From my perspective, I represent the AWS side. The study will include practical hands-on exercises.

<context>
- Due to the South Korean security regulations of a partner company, we need to establish a VPN connection over the public internet. The partner company operates on-premise, while my product is hosted on AWS. While I am proficient in AWS, VPC, and EKS, I lack deep knowledge of VPNs. Therefore, I need to study VPN protocols to effectively discuss and negotiate infrastructure requirements with the partner's infra team.
- The study should focus on AWS Site-to-Site VPN. It is not just about building the connection; I need to understand the underlying protocols (IPSec, etc.), required components, and operational considerations. Since AWS Site-to-Site VPN requires frequent maintenance, I want to be able to discuss it from an operational standpoint. Additionally, I am curious about the principles of Dual Tunnels, ECMP (Equal-Cost Multi-Path), and how to articulate these concepts during technical meetings.
</context>

<instruction>
- Please provide a guide on how I should study. The hands-on exercises will use AWS resources. If a scenario involving AWS VPC and my local PC (MacOS) is feasible, please include a guide for that as well. For the MacOS side, using kind-cluster or docker-compose is preferred.
- The study plan should be designed for a weekend (Saturday and Sunday). Considering my style of balancing theory documentation and hands-on practice, a total of 8 hours of content would be appropriate.
</instruction>

<requirements>
- AWS resources for hands-on exercises must be provisioned using Terraform.
- Use the ap-northeast-2 region.
- Terraform code should use 2-space indentation.
- Do not include comments unless they are essential.
- Use Terraform variables extensively.
- Use the AWS VPC module for VPC configuration.
- Minimize NAT Gateway usage to reduce costs.
- If EC2 instances are required, use t4g.small (Graviton). If necessary, you may use medium or large, but no further.
- Ensure all resources have AWS tags.
- Configure the AWS Site-to-Site VPN as a vpn-concentrator.
  - Reference: https://docs.aws.amazon.com/vpn/latest/s2svpn/vpn-concentrator.html
- Organize Terraform files within a terraform directory.
- Create two distinct modules: aws_cloud and onpremise.
- Define options as variables and ensure modules utilize these variables.
</requirements>

<limitation>
- Do not use git commands.
- Do not execute terraform apply.
- Use t4g instances for cost efficiency. If Graviton causes issues for the on-premise VPN simulation, fallback to t3 instances.
</limitation>

<Security>
- Architecture and VPN configuration from a security perspective are the top priorities when implementing Site-to-Site VPN. It is strictly prohibited for on-premises systems to access unauthorized AWS resources. Although network ranges may be open, the following must be verified:
- Traffic Control via VGW: When using a Virtual Private Gateway (VGW) with static routing, verify if access can be restricted solely to a specific Network Load Balancer (NLB).
- Traffic Control via TGW: When using a Transit Gateway (TGW), verify the feasibility of disabling VPC propagation and using /32 static routes in the TGW route table to ensure only the NLB is accessible.
- AWS VPN CloudHub Risk Mitigation: If multiple unrelated third-party companies connect to a single VGW, there is a potential risk of inter-customer communication. I must investigate how to prevent this "CloudHub" effect and identify specific configurations to bypass this risk, such as VPN Local/Remote ID settings and VGW static route table isolation.
  - Reference: https://docs.aws.amazon.com/vpn/latest/s2svpn/VPN_CloudHub.html
</Security>

<HighAvailability>
- Once security is verified, a high availability (HA) strategy is required to handle tunnel failures. Assuming a single on-premises VPN device with two active tunnels, the following must be documented in highavailability.md:
- HA Behavior Comparison: Analyze the failover behavior of VGW (Active/Standby) versus TGW (Active/Active with ECMP).
- Perspective-based Analysis: Document how traffic flows and fails over from both the AWS and on-premises perspectives during a tunnel outage.
- Maintenance Operations: Understand and document the specific behavior and impact during AWS VPN maintenance events to ensure service continuity.
</HighAvailability>

<Observability>
- A robust system for monitoring and alerting for AWS Site-to-Site VPN is essential. This includes:
- Logging and Metrics: Reviewing VPN logs (connection logs, status logs) and CloudWatch metrics.
- Alerting Framework: Designing a notification flow using CloudWatch Alarms integrated with Slack to ensure rapid awareness of tunnel "DOWN" states.
- reference: https://docs.aws.amazon.com/vpn/latest/s2svpn/monitoring-logs.html
- reference: https://docs.aws.amazon.com/vpn/latest/s2svpn/status-logs.html
- reference: https://docs.aws.amazon.com/vpn/latest/s2svpn/enable-logs.html
- reference: https://docs.aws.amazon.com/vpn/latest/s2svpn/enable-logs.html
</Observability>
