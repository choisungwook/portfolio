# nginx ALB 도메인 (온프레미스 시뮬레이션용)
resource "aws_route53_record" "nginx_alb" {
  zone_id = var.route53_zone_id
  name    = "abc-ec2-nginx.${data.aws_route53_zone.main.name}"
  type    = "A"

  alias {
    name                   = aws_lb.nginx.dns_name
    zone_id                = aws_lb.nginx.zone_id
    evaluate_target_health = true
  }
}

# redirect ALB 도메인
resource "aws_route53_record" "redirect_alb" {
  zone_id = var.route53_zone_id
  name    = var.domain_name
  type    = "A"

  alias {
    name                   = aws_lb.redirect.dns_name
    zone_id                = aws_lb.redirect.zone_id
    evaluate_target_health = true
  }
}
