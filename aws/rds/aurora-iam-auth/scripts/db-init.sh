#!/usr/bin/env bash
# 마이그레이션 전 상태를 만든다: 샘플 테이블 + password 방식 DB 사용자(app_pw).
# 필요 env: AWS_REGION DB_HOST DB_NAME SECRET_ARN PASSWORD_PARAM PW_USER
set -euo pipefail

MASTER_PASSWORD=$(aws secretsmanager get-secret-value --region "$AWS_REGION" --secret-id "$SECRET_ARN" \
  --query SecretString --output text | jq -r .password)
APP_PASSWORD=$(aws ssm get-parameter --region "$AWS_REGION" --name "$PASSWORD_PARAM" \
  --with-decryption --query Parameter.Value --output text)

# 클러스터가 막 만들어졌을 때 DNS 전파가 늦을 수 있어 접속될 때까지 기다린다.
for i in $(seq 1 30); do
  MYSQL_PWD="$MASTER_PASSWORD" mysql -h "$DB_HOST" -u admin --ssl-mode=REQUIRED -e 'SELECT 1' >/dev/null 2>&1 && break
  sleep 10
done

MYSQL_PWD="$MASTER_PASSWORD" mysql -h "$DB_HOST" -u admin --ssl-mode=REQUIRED <<SQL
CREATE TABLE IF NOT EXISTS ${DB_NAME}.items (
  id   INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(50) NOT NULL
);
INSERT INTO ${DB_NAME}.items (name)
  SELECT * FROM (SELECT 'apple' UNION ALL SELECT 'banana' UNION ALL SELECT 'cherry') AS seed
  WHERE NOT EXISTS (SELECT 1 FROM ${DB_NAME}.items);
CREATE USER IF NOT EXISTS '${PW_USER}'@'%' IDENTIFIED BY '${APP_PASSWORD}' REQUIRE SSL;
GRANT SELECT ON ${DB_NAME}.* TO '${PW_USER}'@'%';
SQL

echo "db-init done: ${DB_NAME}.items, user ${PW_USER}"
