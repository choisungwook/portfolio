from fastapi import FastAPI, HTTPException, Query, Path
from typing import List
import logging

from db import execute_query
from schemas import HealthResponse, PostDetail, Comment, PostForUserList, PostForTagList

app = FastAPI(
  title="Blog API with Pydantic",
  description="API for managing posts, comments, users, and tags, using Pydantic models.",
  version="0.1.0",
)

logging.basicConfig(level=logging.INFO)


@app.get("/health", response_model=HealthResponse)
async def health_check():
  """서버 상태 확인"""
  return {"status": "ok"}


@app.get("/posts/{post_id}", response_model=PostDetail)
async def get_post(post_id: int = Path(..., title="The ID of the post to get", ge=1)):
  """특정 게시글 조회 (작성자 정보 포함)"""
  logging.info(f"Fetching post with ID: {post_id}")
  query = """
        SELECT p.id, p.title, p.body, p.created_at, u.username as author_username
        FROM posts p
        LEFT JOIN users u ON p.author_id = u.user_id
        WHERE p.id = %s
    """
  post = execute_query(query, (post_id,), fetch_one=True)
  if not post:
    logging.warning(f"Post with ID {post_id} not found.")
    raise HTTPException(status_code=404, detail="Post not found")
  return post


@app.get("/posts/{post_id}/comments", response_model=List[Comment])
async def get_comments_for_post(
  post_id: int = Path(..., title="The ID of the post to get comments for", ge=1),
  limit: int = Query(20, title="Limit number of comments", ge=1, le=100),
  offset: int = Query(0, title="Offset for pagination", ge=0),
):
  """특정 게시글의 댓글 목록 조회 (댓글 작성자 정보 포함)"""
  logging.info(
    f"Fetching comments for post ID: {post_id}, limit={limit}, offset={offset}"
  )
  # 먼저 게시글 존재 여부 확인 (선택적이지만 권장)
  check_post_query = "SELECT id FROM posts WHERE id = %s"
  post_exists = execute_query(check_post_query, (post_id,), fetch_one=True)
  if not post_exists:
    logging.warning(f"Post with ID {post_id} not found, cannot get comments.")
    raise HTTPException(status_code=404, detail="Post not found, cannot get comments")

  query = """
        SELECT c.comment_id, c.comment_body, c.commented_at, u.username as commenter_username
        FROM comments c
        LEFT JOIN users u ON c.commenter_id = u.user_id
        WHERE c.post_id = %s
        ORDER BY c.commented_at ASC
        LIMIT %s OFFSET %s
    """
  comments = execute_query(query, (post_id, limit, offset))
  logging.info(f"Found {len(comments)} comments for post ID: {post_id}")
  return comments


@app.get("/users/{user_id}/posts", response_model=List[PostForUserList])
async def get_posts_by_user(
  user_id: int = Path(..., title="The ID of the user to get posts for", ge=1),
  limit: int = Query(10, title="Limit number of posts", ge=1, le=100),
  offset: int = Query(0, title="Offset for pagination", ge=0),
):
  """특정 사용자가 작성한 게시글 목록 조회"""
  logging.info(f"Fetching posts for user ID: {user_id}, limit={limit}, offset={offset}")
  # 사용자 존재 여부 확인 (선택적)
  check_user_query = "SELECT user_id FROM users WHERE user_id = %s"
  user_exists = execute_query(check_user_query, (user_id,), fetch_one=True)
  if not user_exists:
    logging.warning(f"User with ID {user_id} not found, cannot get posts.")
    raise HTTPException(status_code=404, detail="User not found, cannot get posts")

  query = """
        SELECT id, title, created_at
        FROM posts
        WHERE author_id = %s
        ORDER BY created_at DESC
        LIMIT %s OFFSET %s
    """
  posts = execute_query(query, (user_id, limit, offset))
  logging.info(f"Found {len(posts)} posts for user ID: {user_id}")
  return posts


@app.get("/tags/{tag_name}/posts", response_model=List[PostForTagList])
async def get_posts_by_tag(
  tag_name: str = Path(..., title="The tag name to filter posts by", min_length=1),
  limit: int = Query(50, title="Limit number of posts", ge=1, le=200),
  offset: int = Query(0, title="Offset for pagination", ge=0),
):
  """특정 태그가 달린 게시글 목록 조회 (작성자 정보 포함)"""
  logging.info(f"Fetching posts for tag: '{tag_name}', limit={limit}, offset={offset}")
  # 태그 존재 여부 확인 (선택적)
  # check_tag_query = "SELECT tag_id FROM tags WHERE tag_name = %s"
  # tag_exists = execute_query(check_tag_query, (tag_name,), fetch_one=True)
  # if not tag_exists:
  #      logging.warning(f"Tag '{tag_name}' not found.")
  #      raise HTTPException(status_code=404, detail=f"Tag '{tag_name}' not found")
  # 참고: 위 태그 확인 쿼리 대신 아래 본 쿼리에서 결과가 없으면 빈 리스트가 반환되도록 처리해도 됨

  query = """
        SELECT p.id, p.title, p.created_at, u.username as author_username
        FROM posts p
        JOIN post_tags pt ON p.id = pt.post_id
        JOIN tags t ON pt.tag_id = t.tag_id
        LEFT JOIN users u ON p.author_id = u.user_id
        WHERE t.tag_name = %s
        ORDER BY p.created_at DESC
        LIMIT %s OFFSET %s
    """
  posts = execute_query(query, (tag_name, limit, offset))
  logging.info(f"Found {len(posts)} posts for tag: '{tag_name}'")
  return posts
