"""minimem 단위 테스트. LLM 없이 parser, 저장, 검색, 컨텍스트를 검사한다."""

import os
import tempfile
import unittest
from pathlib import Path

from minimem import db, search
from minimem.context import build_context
from minimem.hook import should_skip
from minimem.observer import parse_observations, parse_summary

RESPONSE = """<observation>
  <type>bugfix</type>
  <title>할인율 계산에서 퍼센트를 100으로 나누지 않던 버그 수정</title>
  <facts><fact>apply_discount가 rate를 그대로 곱했다</fact><fact>pytest 3개 통과</fact></facts>
  <narrative>할인율이 정수 퍼센트로 들어와 가격이 음수가 됐다.</narrative>
  <files><file>shop/discount.py</file></files>
</observation>
<observation><type>unknown</type><title>타입이 틀린 관찰</title></observation>
<summary><request>테스트 수정</request><learned>rate는 퍼센트</learned><completed>버그 수정</completed><next_steps>환불 기능</next_steps></summary>"""


class MinimemTest(unittest.TestCase):
  """임시 DB에서 observer 결과를 저장하고 검색한다."""

  def setUp(self) -> None:
    """테스트마다 새 DB를 쓴다."""
    self.tmp = tempfile.TemporaryDirectory()
    os.environ["MINIMEM_HOME"] = self.tmp.name
    self.conn = db.connect(Path(self.tmp.name) / "memory.db")
    for obs in parse_observations(RESPONSE):
      db.insert_observation(self.conn, "s1", "lab", obs)
    db.upsert_summary(self.conn, "s1", "lab", parse_summary(RESPONSE))

  def tearDown(self) -> None:
    """임시 디렉터리를 지운다."""
    self.conn.close()
    self.tmp.cleanup()

  def test_parse_falls_back_to_change(self) -> None:
    """허용되지 않은 type은 change로 바뀐다."""
    self.assertEqual([o["type"] for o in parse_observations(RESPONSE)], ["bugfix", "change"])

  def test_search_long_korean_term(self) -> None:
    """3글자 이상 한국어 검색어는 trigram으로 조사가 붙은 단어 안에서도 찾는다."""
    self.assertIn("#1", search.search(self.conn, "lab", "할인율"))

  def test_search_short_korean_term(self) -> None:
    """2글자 검색어는 LIKE로 처리해 찾는다."""
    self.assertIn("#1", search.search(self.conn, "lab", "버그"))

  def test_search_and_or(self) -> None:
    """없는 단어가 섞이면 and는 실패하고 or는 일치한 관찰을 찾는다."""
    self.assertEqual(search.search(self.conn, "lab", "할인율 쿠폰", mode="and"), "검색 결과 없음")
    self.assertIn("#1", search.search(self.conn, "lab", "할인율 쿠폰", mode="or"))

  def test_context_fits_budget(self) -> None:
    """글자 수 예산을 넘으면 오래된 관찰부터 빠지고 최신 관찰은 남는다."""
    for i in range(30):
      db.insert_observation(self.conn, "s2", "lab", {"type": "change", "title": f"관찰 {i} " + "가" * 100, "facts": [], "narrative": "", "files": []})
    ctx = build_context(self.conn, "lab", limit=50, max_chars=2000)
    self.assertLessEqual(len(ctx), 2000)
    self.assertIn("관찰 29", ctx)
    self.assertNotIn("#1 [bugfix]", ctx)

  def test_skip_memory_tools(self) -> None:
    """메모리 조회 도구는 기록하지 않는다."""
    self.assertTrue(should_skip("mcp__minimem__search"))
    self.assertFalse(should_skip("Edit"))

  def test_search_other_project(self) -> None:
    """다른 프로젝트의 관찰은 검색되지 않는다."""
    self.assertEqual(search.search(self.conn, "other", "할인율"), "검색 결과 없음")

  def test_context_has_index_not_narrative(self) -> None:
    """컨텍스트에는 제목 인덱스만 있고 서술 본문은 없다."""
    ctx = build_context(self.conn, "lab")
    self.assertIn("#1 [bugfix]", ctx)
    self.assertIn("다음 할 일: 환불 기능", ctx)
    self.assertNotIn("음수가 됐다", ctx)


if __name__ == "__main__":
  unittest.main()
