data "aws_availability_zones" "available" {
  state = "available"
}

# EKS API endpoint는 지금 이 공유기의 공인 IP 하나로만 연다
data "http" "my_ip" {
  url = "https://checkip.amazonaws.com"
}

locals {
  my_ip_cidr = "${chomp(data.http.my_ip.response_body)}/32"
}
