from django.contrib import admin
from django.urls import path
from memo import views

urlpatterns = [
    path("admin/", admin.site.urls),
    path('', views.memo_list, name='memo_list'),
    path('create/', views.memo_create, name='memo_create'),
    path('update/<int:pk>/', views.memo_update, name='memo_update'),
    path('delete/<int:pk>/', views.memo_delete, name='memo_delete')
]
