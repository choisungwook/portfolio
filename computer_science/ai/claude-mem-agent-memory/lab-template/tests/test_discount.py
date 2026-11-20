"""할인 계산 테스트."""

import unittest

from shop.discount import apply_discount


class DiscountTest(unittest.TestCase):
  """apply_discount 검사."""

  def test_ten_percent(self) -> None:
    """10% 할인."""
    self.assertEqual(apply_discount(10000, 10), 9000)

  def test_zero_percent(self) -> None:
    """할인 없음."""
    self.assertEqual(apply_discount(10000, 0), 10000)


if __name__ == "__main__":
  unittest.main()
