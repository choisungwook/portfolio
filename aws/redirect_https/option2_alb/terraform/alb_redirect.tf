# =============================================================================
# ALB 2: Static Redirect (후보2 솔루션)
# =============================================================================
#
# EC2 nginx 없이 ALB만으로 리다이렉트합니다.
# http://abc-ec2.choilab.xyz → 301 → https://def-ec2.choilab.xyz
#
# 마이그레이션 순서:
# 1. terraform apply로 redirect ALB 생성
# 2. curl -v http://abc-ec2.choilab.xyz 로 redirect 확인
# 3. 정상 동작 확인 후 nginx ALB, EC2 인스턴스 제거
#
# 장점:
# - EC2 인스턴스 관리 불필요 (보안패치, 장애 대응 등)
# - ALB가 자체적으로 301 응답을 반환하므로 지연시간 최소
# - 인프라 코드만으로 redirect 설정 변경 가능
# =============================================================================

resource "aws_lb" "redirect" {
  name               = "${var.project_name}-redirect-alb"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb_redirect.id]
  subnets            = data.aws_subnets.default.ids
}

resource "aws_lb_listener" "redirect_http" {
  load_balancer_arn = aws_lb.redirect.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type = "redirect"

    # HTTP → HTTPS 리다이렉트: http://abc-ec2.choilab.xyz → https://def-ec2.choilab.xyz
    redirect {
      host        = var.redirect_target_host
      port        = "443"
      protocol    = "HTTPS"
      path        = "/#{path}"
      query       = "#{query}"
      status_code = "HTTP_301"
    }
  }
}
