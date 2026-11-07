# EC2 application status check: 60초마다 /healthz를 호출해 앱 수준 상태를 EC2 상태 검사에 더한다.
# hashicorp/aws provider에 리소스가 아직 없어 awscc(Cloud Control)로 만든다.
resource "awscc_ec2_application_status_check" "app" {
  protocol                            = "http"
  port                                = var.app_port
  path                                = "/healthz"
  status_code_matcher                 = "200"
  timeout                             = 5
  failure_threshold                   = 2
  success_threshold                   = 2
  initialization_grace_period_seconds = 300
  aggregation                         = "included"

  # source SG를 직접 지정해야 app SG에서 이 SG만 허용할 수 있다.
  health_check_paths = [{
    source = {
      subnet_id         = data.aws_subnet.app.id
      security_group_id = aws_security_group.healthcheck.id
    }
    destinations = [{
      subnet_id         = data.aws_subnet.app.id
      security_group_id = aws_security_group.app.id
    }]
  }]

  tags = [{
    key   = "Name"
    value = "${var.project_name}-app"
  }]
}

# association은 CloudFormation/awscc에도 리소스가 없어 CLI로 붙이고 뗀다.
resource "terraform_data" "app_status_check_association" {
  input = {
    region      = var.aws_region
    check_id    = awscc_ec2_application_status_check.app.application_status_check_id
    instance_id = aws_instance.app.id
  }

  provisioner "local-exec" {
    command = "aws ec2 associate-application-status-check --region ${self.input.region} --application-status-check-id ${self.input.check_id} --instance-ids ${self.input.instance_id}"
  }

  provisioner "local-exec" {
    when       = destroy
    on_failure = continue
    command    = "aws ec2 disassociate-application-status-check --region ${self.input.region} --application-status-check-id ${self.input.check_id} --instance-ids ${self.input.instance_id}"
  }
}
