"""할인 계산."""


def apply_discount(price: int, rate: int) -> int:
  """price에 rate 퍼센트 할인을 적용한 금액을 반환한다. rate는 정수 퍼센트다(10 = 10%)."""
  return price - price * rate
