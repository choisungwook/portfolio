# =============================================================================
# manual.tf - CloudFront 옵션 분석 및 제약사항 정리
# =============================================================================
#
# 이 파일은 CloudFront를 이용한 redirect 구현 시 고려한 옵션과
# 제약사항을 정리한 문서입니다. 실제 리소스는 생성하지 않습니다.
#
# =============================================================================
# 1. CloudFront 커스텀 도메인 (aliases)
# =============================================================================
#
# CloudFront에 커스텀 도메인을 연결하려면 반드시 ACM 인증서가 필요합니다.
# - ACM 인증서는 us-east-1 리전에 있어야 합니다 (CloudFront 글로벌 서비스 제약)
# - 인증서는 aliases에 등록된 모든 도메인을 커버해야 합니다
# - 와일드카드 인증서 (*.choilab.xyz)를 사용하면 여러 서브도메인을 한 인증서로 처리 가능
#
# 결론: HTTP만 사용하더라도 커스텀 도메인을 사용하는 순간 ACM이 필수입니다.
#       이는 원래 요구사항의 "HTTPS 불필요 → ACM 불필요" 가정과 충돌합니다.
#
# =============================================================================
# 2. viewer_protocol_policy 옵션
# =============================================================================
#
# CloudFront의 viewer_protocol_policy에는 3가지 옵션이 있습니다:
#
# (a) "redirect-to-https" (현재 설정)
#     - HTTP 요청이 오면 자동으로 HTTPS로 리다이렉트
#     - 가장 보안적으로 안전한 옵션
#     - 단점: HTTP 요청 시 2번의 리다이렉트 발생
#       예) http://abc.choilab.xyz → 301 https://abc.choilab.xyz → 301 http://def.choilab.xyz
#
# (b) "allow-all"
#     - HTTP와 HTTPS 모두 허용
#     - HTTP 요청이 그대로 CloudFront Function까지 도달
#     - 장점: HTTP 요청 시 1번의 리다이렉트만 발생
#       예) http://abc.choilab.xyz → 301 http://def.choilab.xyz
#     - 단점: def.choilab.xyz에 대한 HTTP 접근도 허용됨
#
# (c) "https-only"
#     - HTTPS만 허용, HTTP 요청은 403 Forbidden 반환
#     - redirect 시나리오에서는 부적절 (HTTP 요청을 처리해야 하므로)
#
# 핸즈온 선택: "redirect-to-https"
# - abc.choilab.xyz로 HTTP 접근 시 HTTPS로 먼저 리다이렉트 후 Function 실행
# - def.choilab.xyz의 HTTPS 접근을 보장
# - 실제 시나리오에서 "allow-all"을 선택하면 HTTP redirect를 직접 처리 가능하지만,
#   ACM 인증서가 이미 필요한 상황이므로 HTTPS 강제가 더 적절
#
# =============================================================================
# 3. 기존 CloudFront 배포에 대한 영향 분석
# =============================================================================
#
# 제약사항: def.choilab.xyz.com이 이미 CloudFront를 사용 중
#
# 접근 방식 A: 기존 CloudFront에 abc.choilab.xyz를 aliases로 추가
#   장점: 리소스 추가 없이 기존 배포 활용
#   위험:
#   - CloudFront 설정 변경 시 5~15분 전파 시간 동안 기존 서비스 영향 가능
#   - Function 코드 오류 시 def.choilab.xyz.com 서비스에도 영향
#   - aliases 변경은 CloudFront 배포 업데이트를 트리거하므로 전체 재배포 발생
#   - 롤백 시에도 5~15분 소요
#
# 접근 방식 B: 새로운 CloudFront 배포 생성 (핸즈온에서 채택)
#   장점:
#   - 기존 서비스에 영향 없음 (완전히 독립적)
#   - 문제 발생 시 새 배포만 삭제하면 됨
#   - 독립적으로 테스트 가능
#   위험:
#   - 동일한 도메인을 두 CloudFront에서 사용 불가 (aliases 중복 금지)
#   - 추가 비용 (미미하지만 관리 포인트 증가)
#
# 핸즈온 선택: 접근 방식 B (새 CloudFront 배포)
# - 핸즈온에서는 def.choilab.xyz와 abc.choilab.xyz를 하나의 새 배포로 구성
# - Host 헤더 기반 CloudFront Function으로 요청 분기
# - 기존 def.choilab.xyz.com CloudFront에는 영향 없음
#
# =============================================================================
# 4. CloudFront Function vs Lambda@Edge 비교
# =============================================================================
#
# CloudFront Function:
#   - 실행 위치: Edge Location (더 가까움)
#   - 실행 시간 제한: 1ms
#   - 메모리: 2MB
#   - 요금: 백만 건당 $0.10
#   - 제약: HTTP 헤더 조작, 단순 redirect에 적합
#   - 네트워크 호출 불가
#
# Lambda@Edge:
#   - 실행 위치: Regional Edge Cache
#   - 실행 시간 제한: viewer 5초 / origin 30초
#   - 메모리: 128MB~10GB
#   - 요금: 백만 건당 $0.60 + 실행시간 요금
#   - 장점: 외부 API 호출, DB 조회 등 복잡한 로직 가능
#
# 선택: CloudFront Function
# - 단순 Host 헤더 확인 + 301 redirect이므로 CloudFront Function으로 충분
# - 더 빠르고 저렴
#
# =============================================================================
# 5. NS 레코드 이관 필요성
# =============================================================================
#
# CloudFront 커스텀 도메인 사용 시:
#   - Route53에 A 레코드 (alias) 생성 필요
#   - ACM DNS 검증을 위한 CNAME 레코드 생성 필요
#   - 따라서 Route53이 해당 도메인의 NS를 소유해야 함
#
# 온프레미스 DNS → Route53 이관 필요:
#   - abc.choilab.xyz의 NS 레코드를 Route53으로 이관 요청
#   - DNS 전파 시간 (TTL에 따라 수분~수시간)
#   - 장애 허용시간 20분 이내에 완료하려면 사전에 TTL을 낮춰놓는 것이 중요
#
# =============================================================================
# 6. 마이그레이션 절차 (실제 시나리오)
# =============================================================================
#
# Step 1: 사전 준비
#   - Route53 hosted zone 확인 (Z058070420NEN8I4XE7YR)
#   - ACM 인증서 발급 (us-east-1, *.choilab.xyz 또는 abc.choilab.xyz)
#   - 온프레미스 DNS의 abc.choilab.xyz TTL을 300초(5분) 이하로 낮추기 요청
#
# Step 2: AWS 리소스 배포
#   - terraform apply (enable_redirect = true)
#   - CloudFront 전파 완료 대기 (5~15분)
#   - CloudFront 도메인으로 직접 테스트
#
# Step 3: DNS 전환
#   - 온프레미스 DNS에서 abc.choilab.xyz 레코드를 Route53 NS로 변경 요청
#   - 또는 온프레미스 DNS에서 abc.choilab.xyz CNAME을 CloudFront 도메인으로 직접 지정
#
# Step 4: 검증
#   - curl -v http://abc.choilab.xyz → 301 redirect 확인
#   - 기존 def.choilab.xyz.com 서비스 정상 확인
#
# =============================================================================
# 7. 비용 분석
# =============================================================================
#
# CloudFront:
#   - 데이터 전송: redirect 응답이므로 거의 없음
#   - 요청 수: HTTPS 요청 1만 건당 $0.01
#   - CloudFront Function: 백만 건당 $0.10
#   - 예상 월 비용: $0.01~$1 (트래픽에 따라)
#
# ACM: 무료
# Route53: A 레코드 $0.50/월 + 쿼리 100만 건당 $0.40
#
# 총 예상 비용: $1~2/월 (ALB의 $18~22/월 대비 매우 저렴)
# 단, ACM 발급 및 NS 이관이라는 추가 작업이 필요
