a = []
for idx in range(0, 10):
    a.append(idx)

b = a[0:4]

# 변경 전
print(b)

a[0] = 11
a[0] = 22
a[0] = 33

# 변경 후
print(b)