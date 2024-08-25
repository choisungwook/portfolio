from django.contrib import admin
from django.urls import path
from memo import views

urlpatterns = [
    path("admin/", admin.site.urls),
    path('', views.memo_list, name='memo_list'),
]
