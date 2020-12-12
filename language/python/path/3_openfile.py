from pathlib import Path

target_file = Path('src.txt')

# above 3.6
with open(target_file, 'rt') as f:
  lines = f.readline()

  print(lines)