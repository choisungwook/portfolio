import os
from git.repo.base import Repo
import chevron
import shutil
import stat
import git

dst = os.path.join("gitclone_test")
src = "https://gitlab.choilab.com/common/springboot-helm.git"

def readonly_handler(func, path, execinfo):
    os.chmod(path, stat.S_IWRITE)
    func(path)

def change_helmvalues():
    values_path = os.path.join(dst, "values.yaml")

    if os.path.exists(values_path):

        changed = None
        with open(values_path, 'r') as f:
            changed = chevron.render(f, 
                {
                    "IMAGENAME": "nginx",
                    "IMAGETAG": "testversion",
                    "PORT": 80,
                    "CPU": 0.2,
                    "MEMORY": "512Mi"
                }
            )
        
            # print(changed)
            # print(type(changed)) # str

        if changed:
            with open(values_path, 'w') as f:
                f.write(changed)
        else:
            print("error")
        

try:
    if os.path.exists(dst):
        #reference: https://programmersought.com/article/97605598037/
        shutil.rmtree(dst, onerror=readonly_handler)

    # reference: https://stackoverflow.com/questions/2472552/python-way-to-clone-a-git-repository

    r = Repo.clone_from(src, dst)
    change_helmvalues()
    
    # reference: https://gitpython.readthedocs.io/en/stable/tutorial.html
    values_path = os.path.join("values.yaml")
    r.index.add([values_path])
    r.index.commit("change values parameter")

    r.git.push()
    
except Exception as e:
    print("error: {}".format(e))
    