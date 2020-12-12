from glob import glob
import os

print("------------------- glob --------------------")
for filename in glob("**/*.txt", recursive=True):
  print(os.path.abspath(filename))

print("------------- os.walk() ----------------")
for dirpath, dirs, files in os.walk("."):
  for filename in files:
    if filename.endswith(".txt"):
      filepath = os.path.join(dirpath, filename)
      print(filepath)