from django.shortcuts import render
from .models import Memo

# Create your views here.
def memo_list(request):
    memos = Memo.objects.all().order_by('-created_at')
    return render(request, "memo_list.html", {"memos": memos})