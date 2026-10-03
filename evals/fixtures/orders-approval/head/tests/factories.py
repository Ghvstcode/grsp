from decimal import Decimal
from types import SimpleNamespace

from orders.models import Order


class FakeRepo:
    def __init__(self, orders=None):
        self.orders = {o.id: o for o in (orders or [])}
        self.inserted = []

    def get(self, order_id):
        return self.orders[order_id]

    def insert(self, order):
        self.inserted.append(order)
        return order

    def update(self, order):
        self.orders[order.id] = order
        return order


def order_input(total):
    return {
        "customer_id": 1,
        "currency": "EUR",
        "items": [{"sku": "A1", "unit_price": Decimal(total), "quantity": 1}],
    }


def make_order(id, status, created_by):
    return Order(id=id, status=status, created_by=created_by, customer_id=1, total_amount=Decimal("25000.00"))


def make_user(id):
    return SimpleNamespace(id=id)
