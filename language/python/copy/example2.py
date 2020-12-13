def function1(a):
    a[0] = 44

def main():
    a = [1, 2, 3]
    b = a
    c = a.copy()

    # 값 변경
    function1(a)

    print(a)
    print(b)
    print(c)
    print(a is b)
    print(a is c)

if __name__=='__main__':
    main()