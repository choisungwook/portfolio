from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class HealthResponse(BaseModel):
  """헬스 체크 응답 모델"""

  status: str


class PostBase(BaseModel):
  """게시글 기본 정보 (목록용)"""

  id: int
  title: str
  created_at: datetime


class PostDetail(PostBase):
  """개별 게시글 상세 정보 (작성자 포함)"""

  body: str
  author_username: Optional[str]  # author_id가 NULL일 수 있으므로 Optional


class Comment(BaseModel):
  """댓글 정보"""

  comment_id: int
  # post_id: int # API 응답에서는 보통 제외
  commenter_username: Optional[str]  # commenter_id가 NULL일 수 있으므로 Optional
  comment_body: str
  commented_at: datetime


class PostForUserList(PostBase):
  """사용자별 게시글 목록에 사용될 모델 (PostBase와 동일)"""

  pass  # 현재 쿼리로는 PostBase와 동일하므로 상속만 받음


class PostForTagList(PostBase):
  """태그별 게시글 목록에 사용될 모델 (작성자 포함)"""

  author_username: Optional[str]
