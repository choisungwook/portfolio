import uuid

def generate_uuid():
    '''
        랜덤 UUID 생성
    '''
    return uuid.uuid4().__str__().replace("-", "")


toekn = generate_uuid()
print(toekn) # ex: 1a7e57b5b24443009b2756fcc81881ac
