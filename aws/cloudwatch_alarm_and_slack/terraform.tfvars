# --- project Configuration ---
aws_region       = "ap-northeast-2"
project_name     = "cloudwatch-alarm"
environment_name = "cloudwatch-alarm-demo"
common_tags = {
  Project = "cloudwatch-alarm"
  Name    = "cloudwatch-alarm-demo"
}

# --- RDS Configuration ---
db_name                = "demodb"
rds_cluster_identifier = "cloudwatch-alarm-demo"
rds_engine             = "aurora-mysql"
rds_engine_version     = "8.0.mysql_aurora.3.06.0"
rds_instance_class     = "db.t3.medium"
rds_username           = "admin"
rds_password           = "Password1234!!#"
rds_storage_type       = "aurora"
rds_storage_encrypted  = true

# --- Lambda Configuration ---
lambda_function_name = "cloudwatch-to-slack-notifier"
lambda_runtime       = "python3.12"
lambda_handler       = "lambda_function.lambda_handler"

# --- VPC Configuration ---
vpc_name               = "cloudwatch-alarm-vpc"
vpc_cidr               = "10.0.0.0/16"
vpc_azs                = ["ap-northeast-2a", "ap-northeast-2c"] # Ensure these are valid for ap-northeast-2
vpc_private_subnets    = ["10.0.1.0/24", "10.0.2.0/24"]
vpc_public_subnets     = ["10.0.101.0/24", "10.0.102.0/24"]
vpc_enable_nat_gateway = true
vpc_single_nat_gateway = true

# --- EC2 instance ---
sysbench_ec2_instance_type = "t3.medium"
