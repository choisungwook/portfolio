#!/bin/bash
set -e

if [ -z "$MYSQL_HOST" ] || [ -z "$MYSQL_PASSWORD" ]; then
  echo "Usage: MYSQL_HOST=<host> MYSQL_PASSWORD=<password> EXIST_USER=<username> ./migrate_mysql.sh"
  exit 1
fi

MYSQL_USER="${MYSQL_USER:-postgres}"
MYSQL_DB="${MYSQL_DB:-demo}"
EXIST_USER="${EXIST_USER:-exist_user}"

echo "Migrating existing user '$EXIST_USER' to IAM authentication..."

mysql -h "$MYSQL_HOST" -u "$MYSQL_USER" -p"$MYSQL_PASSWORD" <<EOF
ALTER USER '${EXIST_USER}'@'%' IDENTIFIED WITH AWSAuthenticationPlugin AS 'RDS';
ALTER USER '${EXIST_USER}'@'%' REQUIRE SSL;
FLUSH PRIVILEGES;
EOF

echo "Migration completed!"
echo ""
echo "Verify user authentication plugin:"
mysql -h "$MYSQL_HOST" -u "$MYSQL_USER" -p"$MYSQL_PASSWORD" -e "SELECT user, host, plugin FROM mysql.user WHERE user = '${EXIST_USER}';"
