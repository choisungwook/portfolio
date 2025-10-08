aws_region = "ap-northeast-2"

# EC2 instance options
instance_type   = "t4g.nano"
ebs_volume_size = 30
ebs_volume_type = "gp3"

# AWS Common tags
common_tags = {
  Name        = "example1"
  Project     = "practice"
  Environment = "poc"
}
