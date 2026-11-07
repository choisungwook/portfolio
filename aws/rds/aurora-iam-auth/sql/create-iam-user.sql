-- IAM 인증 전용 사용자. 비밀번호 대신 AWSAuthenticationPlugin이 token을 IAM에 검증한다.
CREATE USER IF NOT EXISTS 'app_iam'@'%' IDENTIFIED WITH AWSAuthenticationPlugin AS 'RDS' REQUIRE SSL;
-- 기존 app_pw와 같은 권한을 준다. 권한이 다르면 전환 순간 쿼리가 실패한다.
GRANT SELECT ON labdb.* TO 'app_iam'@'%';
