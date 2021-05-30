import requests
import git
import os
from git.repo.base import Repo

dst = os.path.join("gitclone_test")
src = "https://gitlab.choilab.com/common/springboot-helm.git"

try:
    # reference: https://stackoverflow.com/questions/2472552/python-way-to-clone-a-git-repository
    Repo.clone_from(src, dst)
except Exception as e:
    print("fork error: {}".format(e))
    