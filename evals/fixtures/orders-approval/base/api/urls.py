from django.urls import path

from api.views import orders

urlpatterns = [
    path("orders", orders.create_order),  # POST /orders
    path("orders/<int:order_id>", orders.get_order),  # GET /orders/:id
]
