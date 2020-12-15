import json

result = {}
for i in range(0, 100):
  result[i] = {}
  for j in range(0, 100):
    result[i][j] = 1

with open('example.json', 'wt') as f:
  json.dump(result, f)