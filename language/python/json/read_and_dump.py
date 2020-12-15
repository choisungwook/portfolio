import json

with open('example.json') as f:
  example_json = json.load(f)

with open('result.json', 'w') as f:
  json.dump(example_json, f, ensure_ascii=False, indent=4)