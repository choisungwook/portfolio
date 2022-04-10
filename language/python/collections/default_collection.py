import collections

dst = "aabbcc"
src = "ad"

def answer1():
    count = 0
    r = collections.defaultdict(int)

    for char in dst:
        r[char] += 1

    for char in src:
        count += r[char]

    return count

def answer2():
    count = 0
    r = collections.Counter(dst)
    # print(r)
    
    for char in src:
        count += r[char]

    return count

print(answer1())
print(answer2())
