# Nitro Sandboxes 드라이버는 AL2023 kernel6.18 패키지에 들어 있다. 기본 6.1 AMI가 아니라 6.18 AMI를 고른다
data "aws_ssm_parameter" "al2023_kernel_618" {
  name = "/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-6.18-arm64"
}

data "aws_availability_zones" "available" {
  state = "available"
}

# 접속은 지금 이 공유기의 공인 IP 하나로만 허용한다
data "http" "my_ip" {
  url = "https://checkip.amazonaws.com"
}

locals {
  my_ip_cidr = "${chomp(data.http.my_ip.response_body)}/32"
}
