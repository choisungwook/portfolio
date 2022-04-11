from ast import Call
from typing import Callable

TradingStrategyFunction = Callable[[list[int]], int]

def strategy1(param1: list[int]) -> int:
    print(f"strategy_1 called: {param1}")

    return 0

def strategy2(param1: list[int]) -> int:
    print(f"strategy_2 called: {param1}")
    
    return 1

def test_func(TradingStrategyFunction):
    '''전략패턴'''

    params = [1, 2]
    TradingStrategyFunction(params)

if __name__=="__main__":
    print(f"function: {TradingStrategyFunction}")

    test_func(strategy1)
    test_func(strategy2)
    