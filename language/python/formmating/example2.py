example_dict = {}

for idx in range(0, 10):
  example_dict[idx] = idx

for key, value in example_dict.items():
  formmating = f'key is {key}, value is {value}'
  print(formmating)