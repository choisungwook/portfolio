class ReadVisit:
  def __init__(self, data_path):
    self.data_path = data_path

  """
  내장함수: 제너레이터 사용
  """
  def __iter__(self):
    with open(self.data_path) as f:
      print("I'm called")
      for line in f:
        print("return number: {}".format(int(line)))
        yield int(line)

"""
  메모리 발생 오류가 날 수 있는 함수
"""
def problem_normalize(numbers):
  numbers_copy = numbers.copy()
  total = sum(numbers_copy)

  result = []
  for value in numbers_copy:
    percent = 100 * value/total
    result.append(percent)
  return result
    

"""
  메모리 부족 오류를 해결하기 위해 이터레이터를 사용
"""
def normalize_func(get_iter):
  total = sum(get_iter)

  print('sum: {}'.format(total))

  result = []
  for value in get_iter:
    percent = 100 * value/total
    result.append(percent)
  return result


readObject = ReadVisit('example1.txt')
r = normalize_func(readObject)
print('')
print("result:{}".format(r))