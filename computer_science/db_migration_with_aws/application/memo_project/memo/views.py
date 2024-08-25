from django.shortcuts import render, redirect, get_object_or_404
from .models import Memo
from .forms import MemoForm

# Create your views here.
def memo_list(request):
    memos = Memo.objects.all().order_by('-created_at')
    return render(request, "memo_list.html", {"memos": memos})

def memo_create(request):
    if request.method == "POST":
        form = MemoForm(request.POST)
        if form.is_valid():
            form.save()
            return redirect("memo_list")
    else:
        form = MemoForm()
    return render(request, 'memo_form.html', {'form': form})

def memo_update(request, pk):
    memo = get_object_or_404(Memo, pk=pk)
    if request.method == "POST":
        form = MemoForm(request.POST, instance=memo)
        if form.is_valid():
            form.save()
            return redirect("memo_list")
    else:
        form = MemoForm(instance=memo)
    return render(request, 'memo_form.html', {'form': form})

def memo_delete(request, pk):
    memo = get_object_or_404(Memo, pk=pk)
    if request.method == 'POST':
        memo.delete()
        return redirect("memo_list")
    return render(request, 'memo_confirm_delete.html', {'memo': memo})