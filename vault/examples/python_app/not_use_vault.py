import pymysql

conn = pymysql.connect(
    host='localhost',
    user='root',
    password='NwmaZk$2f2pq27p^^4am',
    database='sakila'
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
