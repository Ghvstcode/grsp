from decimal import Decimal


class FakeRepo:
    def __init__(self, orders=None):
        self.orders = {o.id: o for o in (orders or [])}
        self.inserted = []

    def get(self, order_id):
        return self.orders[order_id]

    def insert(self, order):
        self.inserted.append(order)
        return order


def order_input(total):
    return {
        "customer_id": 1,
        "currency": "EUR",
        "items": [{"sku": "A1", "unit_price": Decimal(total), "quantity": 1}],
    }
