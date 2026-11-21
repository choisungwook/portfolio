-- V4: 이미 적용된 V2(orders 테이블)를 안전하게 되돌리는 보상(롤백) 마이그레이션
-- Flyway Community Edition은 유료 undo 명령을 제공하지 않으므로,
-- 운영 환경에서는 새 버전 번호로 롤백 SQL을 전진 적용(forward-fix)합니다.
DROP TABLE IF EXISTS orders;
