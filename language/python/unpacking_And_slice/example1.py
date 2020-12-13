def generate_csv():
    # 칼럼 헤더
    yield ('a', 'b', 'c')
    yield ('1', '2', '3')
    yield ('4', '5', '6')
    yield ('7', '8', '9')

column, *data = generate_csv()

print(column)
print(data)
print(type(data))