import chevron

with open("test.xml", "r", encoding="utf-8") as f:
    r= chevron.render(f.readline(), {
        "gitrepo": "hello.git",
        "master": "",
        "trigger_token": "world"
    })

    print(r)
