from django.urls import path

from api.views import approvals, orders

urlpatterns = [
    path("orders", orders.create_order),  # POST /orders
    path("orders/<int:order_id>", orders.get_order),  # GET /orders/:id
    path("orders/<int:order_id>/approve", approvals.approve_order),  # POST /orders/:id/approve
]
