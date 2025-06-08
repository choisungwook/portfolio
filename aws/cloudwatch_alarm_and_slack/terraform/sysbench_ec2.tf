# resource "aws_instance" "sysbench" {
#   ami           = data.aws_ami.ubuntu.id # Ubuntu AMI
#   instance_type = var.sysbench_ec2_instance_type

#   iam_instance_profile   = aws_iam_instance_profile.sysbench_ec2_ssm_profile.name
#   vpc_security_group_ids = [aws_security_group.sysbench_ec2.id]
#   subnet_id              = module.vpc.private_subnets[0]

#   root_block_device {
#     volume_type           = "gp3"
#     volume_size           = 10
#     encrypted             = true
#     delete_on_termination = true
#   }

#   user_data = <<-EOF
#               #!/bin/bash
#               # Ubuntu setup
#               apt-get update
#               apt-get install -y sysbench mysql-client
#               # For PostgreSQL, you would install postgresql client and sysbench with pg driver
#               # apt-get install -y sysbench postgresql-client

#               echo "User data script completed."
#               EOF

#   tags = var.common_tags
# }

# data "aws_ami" "ubuntu" {
#   most_recent = true
#   owners      = ["amazon"]

#   filter {
#     name   = "name"
#     values = ["ubuntu/images/hvm-ssd/ubuntu-jammy-22.04-amd64-server-*"]
#   }
# }

# resource "aws_iam_role" "ec2_ssm_role" {
#   name = "${var.environment_name}-sysbench-ssm"

#   assume_role_policy = jsonencode({
#     Version = "2012-10-17"
#     Statement = [
#       {
#         Action = "sts:AssumeRole"
#         Effect = "Allow"
#         Principal = {
#           Service = "ec2.amazonaws.com"
#         }
#       }
#     ]
#   })
# }

# resource "aws_iam_role_policy_attachment" "ssm_policy" {
#   role       = aws_iam_role.ec2_ssm_role.name
#   policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
# }

# resource "aws_iam_instance_profile" "sysbench_ec2_ssm_profile" {
#   name = "${var.environment_name}-sysbench-ec2-ssm"
#   role = aws_iam_role.ec2_ssm_role.name
# }

# resource "aws_security_group" "sysbench_ec2" {
#   name        = "${var.environment_name}-sysbench-ec2"
#   description = "Security group for EC2 instance running sysbench for FIS"
#   vpc_id      = module.vpc.vpc_id

#   egress {
#     from_port   = 0
#     to_port     = 0
#     protocol    = "-1"
#     cidr_blocks = ["0.0.0.0/0"]
#   }

#   tags = var.common_tags
# }
