#!/bin/bash
set -e

if [ -z "$PGHOST" ] || [ -z "$PGPASSWORD" ]; then
  echo "Usage: PGHOST=<host> PGPASSWORD=<password> EXIST_USER=<username> ./migrate_postgres.sh"
  exit 1
fi

export PGUSER="${PGUSER:-postgres}"
export PGDATABASE="${PGDATABASE:-demo}"
export PGPORT="${PGPORT:-5432}"
EXIST_USER="${EXIST_USER:-exist_user}"

echo "Migrating existing user '$EXIST_USER' to IAM authentication..."

psql <<EOF
GRANT rds_iam TO ${EXIST_USER};
EOF

echo "Migration completed!"
echo ""
echo "Verify rds_iam role assignment:"
psql -c "SELECT r.rolname, m.member::regrole FROM pg_auth_members m JOIN pg_roles r ON m.roleid = r.oid WHERE r.rolname = 'rds_iam' AND m.member::regrole::text = '${EXIST_USER}';"
