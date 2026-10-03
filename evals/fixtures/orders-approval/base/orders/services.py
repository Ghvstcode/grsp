from orders import events
from orders.models import Order, Status
from orders.repository import OrderRepository


class OrderService:
    def __init__(self, repo=None):
        self.repo = repo or OrderRepository()

    def create(self, data, created_by):
        order = Order.from_input(data, created_by=created_by)
        order.status = Status.CONFIRMED
        self.repo.insert(order)
        events.emit_order_created(order)
        return order
