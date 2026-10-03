from orders.models import Order, Status


class OrderRepository:
    def get(self, order_id):
        return Order.objects.get(id=order_id)

    def insert(self, order):
        order.save(force_insert=True)
        return order

    def update(self, order):
        order.save(update_fields=["status", "approved_by", "approved_at"])
        return order

    def insert_many(self, rows):
        orders = [Order.from_row(r) for r in rows]
        for o in orders:
            o.status = Status.CONFIRMED
        return Order.objects.bulk_create(orders)
