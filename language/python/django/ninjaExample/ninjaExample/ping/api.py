from ninja import Router

router = Router()

@router.get('/')
def ping(request):
    return {'ping': 'pong'}

@router.get('/hello')
def ping(request):
    return {'ping': 'pong'}
