resource "aws_instance" "strongswan" {
  ami                    = data.aws_ami.ubuntu.id
  instance_type          = var.ec2_instance_type
  subnet_id              = var.subnet_id
  vpc_security_group_ids = [aws_security_group.ec2.id]
  iam_instance_profile   = aws_iam_instance_profile.ec2_ssm_profile.name

  user_data = <<-EOF
    #!/bin/bash
    set -eux

    # 기본 sysctl 설정
    sysctl -w net.ipv4.ip_forward=1

    # 기본 네트워크 인터페이스 자동 감지
    INTERFACE=$(ip route | grep default | awk '{print $5}')

    # sysctl 설정 적용
    cat <<'SYSCTL_CONF' > /etc/sysctl.d/99-libreswan.conf
    kernel.unknown_nmi_panic = 1
    net.ipv4.ip_forward = 1
    net.ipv4.conf.all.accept_redirects = 0
    net.ipv4.conf.all.send_redirects = 0
    net.ipv4.conf.default.send_redirects = 0
    net.ipv4.conf.default.accept_redirects = 0
    net.ipv4.conf.$INTERFACE.send_redirects = 0
    net.ipv4.conf.$INTERFACE.accept_redirects = 0
    SYSCTL_CONF

    # sysctl 설정 적용
    sysctl --system

    # 패키지 업데이트 및 설치
    apt-get update -y
    apt-get install -y libreswan nginx net-tools
    apt-get install -y frr frr-pythontools

    # FRR 데몬 활성화
    sed -i 's/bgpd=no/bgpd=yes/' /etc/frr/daemons
    systemctl enable frr
    # systemctl start frr

    # nginx 서비스 활성화 및 실행
    systemctl enable nginx
    systemctl start nginx
  EOF

  tags = {
    Name        = "${var.ec2_name}-libreswan"
    environment = "test"
  }
}
