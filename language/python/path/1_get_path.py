from pathlib import Path
from os import getcwd

cwd = getcwd()
path_object = Path(cwd)

# diff getcwd vs Path(getcwd())
print(type(str))
print(type(path_object))

# print parent directory
print(path_object.parent)