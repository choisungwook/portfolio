resource "aws_instance" "this" {
  ami                    = data.aws_ami.ubuntu.id
  instance_type          = var.ec2_instance_type
  subnet_id              = var.subnet_id
  vpc_security_group_ids = [aws_security_group.ec2.id]
  iam_instance_profile   = aws_iam_instance_profile.ec2_ssm_profile.name

  user_data = <<-EOF
              #!/bin/bash
              sleep 1; # wait for cloud-init to finish

              # Install Docker
              apt-get update
              apt-get install ca-certificates curl make
              install -m 0755 -d /etc/apt/keyrings
              curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
              chmod a+r /etc/apt/keyrings/docker.asc
              echo \
                "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu \
                $(. /etc/os-release && echo "$${UBUNTU_CODENAME:-$$VERSION_CODENAME}") stable" | \
                sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

              apt-get update
              apt-get install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin docker-compose
              usermod -aG docker ssm-user
              usermod -aG docker ubuntu

              # Install containerlab
              bash -c "$(curl -sL https://get.containerlab.dev)"
              usermod -aG clab_admins ssm-user && newgrp clab_admins
              usermod -aG clab_admins ubuntu && newgrp clab_admins
              EOF

  tags = {
    Name        = "${var.ec2_name}-docker"
    environment = "test"
  }
}
