import pymysql
import hvac

VAULT_TOKEN=""
vault_client = hvac.Client(
    url='http://localhost:8200',
    # vault token create -policy="mysql-read-policy" -display-name="bob"
    token='{your token}'
)

vault_data = vault_client.secrets.kv.v2.read_secret_version(
    path='database/mysql'
)

# print(vault_data)

mysql_username = vault_data['data']['data']['username']
mysql_password = vault_data['data']['data']['password']
mysql_dastabaes = vault_data['data']['data']['database']

conn = pymysql.connect(
    host='localhost',
    user=mysql_username,
    password=mysql_password,
    database=mysql_dastabaes
)

cursor = conn.cursor()

# sakila database의 모든 table을 조회
cursor.execute("USE sakila;")
cursor.execute("SHOW TABLES;")
results: list[tuple] = cursor.fetchall()

tables = [row[0] for row in results]
print(tables)

cursor.close()
conn.close()
