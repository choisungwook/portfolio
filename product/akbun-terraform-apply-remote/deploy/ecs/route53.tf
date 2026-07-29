# Hosted zone은 콘솔에서 미리 만든 것을 참조한다. zone id가 비어 있으면
# 레코드를 만들지 않고 ALB DNS 이름을 그대로 쓴다.

resource "aws_route53_record" "server" {
  count = var.route53_zone_id != "" ? 1 : 0

  zone_id = var.route53_zone_id
  name    = var.domain_name
  type    = "A"

  alias {
    name                   = aws_lb.server.dns_name
    zone_id                = aws_lb.server.zone_id
    evaluate_target_health = true
  }
}
