resource "aws_instance" "docker_ec2" {
  ami           = "ami-008d41dbe16db6778"  # al2023-ami-2023.5.20240819.0-kernel-6.1-x86_64
  instance_type = "t3.micro"
  iam_instance_profile = aws_iam_instance_profile.ec2_ssm_profile.name

  user_data = file("user_data.sh")

  tags = {
    Name = "docker-ec2"
  }
}

data "aws_iam_policy_document" "ec2_ssm_assume_role_policy" {
  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["ec2.amazonaws.com"]
    }

    effect = "Allow"
  }
}

resource "aws_iam_role" "ec2_ssm_role" {
  name               = "ec2_ssm_role"
  assume_role_policy = data.aws_iam_policy_document.ec2_ssm_assume_role_policy.json
}

resource "aws_iam_role_policy_attachment" "ec2_ssm_attach" {
  role       = aws_iam_role.ec2_ssm_role.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

resource "aws_iam_instance_profile" "ec2_ssm_profile" {
  name = "ec2_ssm_profile"
  role = aws_iam_role.ec2_ssm_role.name
}
