from pathlib import Path
from os import getcwd
from os.path import abspath

cwd = getcwd()
path_object = Path(cwd)

# diff getcwd vs Path(getcwd())
print("str, Path type")
print(type(str))
print(type(path_object))

# print parent directory
print("parent directory")
print(path_object.parent)

# print abspath
print("current abs dirpath")
print(abspath("."))