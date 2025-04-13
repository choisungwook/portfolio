import os
import mysql.connector
import random
from faker import Faker
import time
from dotenv import load_dotenv

load_dotenv()

# 설정
DB_CONFIG = {
  "host": os.getenv("DB_HOST", "localhost"),
  "port": int(os.getenv("DB_PORT", 3306)),
  "user": os.getenv("DB_USER", "root"),
  "password": os.getenv("DB_PASSWORD", "your_root_password"),
  "database": os.getenv("DB_NAME", "testdb"),
  "connection_timeout": 60,
}

# Faker 인스턴스 생성 (한국어 설정)
fake = Faker(["ko_KR"])


# 데이터베이스 연결
def get_db_connection():
  return mysql.connector.connect(**DB_CONFIG)


def create_dummy_data(user_count=1000, post_count=1000, tag_count=50):
  conn = get_db_connection()
  cursor = conn.cursor(dictionary=True)

  try:
    print("데이터 생성 시작...")

    # 1. 사용자 생성
    print(f"{user_count}명의 사용자 생성 중...")
    user_ids = []
    for i in range(user_count):
      username = fake.user_name() + str(random.randint(1, 9999))
      email = f"{fake.email() + str(i)}"
      registered_date = fake.date_time_between(start_date="-2y", end_date="now")

      sql = "INSERT INTO users (username, email, registered_at) VALUES (%s, %s, %s)"
      cursor.execute(sql, (username, email, registered_date))
      user_ids.append(cursor.lastrowid)

      if (i + 1) % 100 == 0:
        print(f"  {i + 1}명의 사용자 생성 완료")
        conn.commit()

    conn.commit()
    print("사용자 생성 완료!")

    # 2. 태그 생성
    print(f"{tag_count}개의 태그 생성 중...")
    tag_ids = []
    tag_names = set()

    while len(tag_names) < tag_count:
      tag_name = fake.word() + str(random.randint(1, 1000))
      tag_names.add(tag_name)

    for tag_name in tag_names:
      sql = "INSERT INTO tags (tag_name) VALUES (%s)"
      cursor.execute(sql, (tag_name,))
      tag_ids.append(cursor.lastrowid)

    conn.commit()
    print("태그 생성 완료!")

    # 3. 게시글 생성
    print(f"{post_count}개의 게시글 생성 중...")
    post_ids = []

    for i in range(post_count):
      author_id = random.choice(user_ids) if random.random() < 0.95 else None
      title = fake.sentence()
      body = fake.text(max_nb_chars=random.randint(200, 2000))
      created_date = fake.date_time_between(start_date="-1y", end_date="now")

      sql = (
        "INSERT INTO posts (author_id, title, body, created_at) VALUES (%s, %s, %s, %s)"
      )
      cursor.execute(sql, (author_id, title, body, created_date))
      post_id = cursor.lastrowid
      post_ids.append(post_id)

      # 각 게시글에 1~5개의 태그 할당
      post_tag_count = random.randint(1, min(5, len(tag_ids)))
      selected_tags = random.sample(tag_ids, post_tag_count)

      for tag_id in selected_tags:
        tag_sql = "INSERT INTO post_tags (post_id, tag_id) VALUES (%s, %s)"
        cursor.execute(tag_sql, (post_id, tag_id))

      if (i + 1) % 100 == 0:
        print(f"  {i + 1}개의 게시글 생성 완료")
        conn.commit()

    conn.commit()
    print("게시글 및 태그 연결 완료!")

    # 4. 댓글 생성
    print("댓글 생성 중...")
    total_comments = 0

    for post_id in post_ids:
      # 각 게시글당 0~10개의 댓글
      comment_count = random.randint(0, 10)

      for _ in range(comment_count):
        commenter_id = random.choice(user_ids) if random.random() < 0.9 else None
        comment_body = fake.paragraph()
        commented_date = fake.date_time_between(start_date="-1y", end_date="now")

        sql = "INSERT INTO comments (post_id, commenter_id, comment_body, commented_at) VALUES (%s, %s, %s, %s)"
        cursor.execute(sql, (post_id, commenter_id, comment_body, commented_date))
        total_comments += 1

        if total_comments % 1000 == 0:
          print(f"  {total_comments}개의 댓글 생성 완료")
          conn.commit()

    conn.commit()
    print(f"총 {total_comments}개의 댓글 생성 완료!")

    print("모든 더미 데이터 생성 완료!")
    print(f"- 사용자: {len(user_ids)}명")
    print(f"- 태그: {len(tag_ids)}개")
    print(f"- 게시글: {len(post_ids)}개")
    print(f"- 댓글: {total_comments}개")

  except Exception as e:
    conn.rollback()
    print(f"오류 발생: {e}")
  finally:
    cursor.close()
    conn.close()


if __name__ == "__main__":
  start_time = time.time()
  create_dummy_data(user_count=1000, post_count=100000, tag_count=50)
  end_time = time.time()
  print(f"실행 시간: {end_time - start_time:.2f}초")
