from pathlib import Path
from shutil import copyfile

src = Path('src.txt')
dst = Path('dst.txt')

copyfile(src, dst)