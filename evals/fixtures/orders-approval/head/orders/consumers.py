from lib.events import consumer
from orders.models import Order, Status
from payments.service import PaymentService


@consumer("order.created", retries=3, backoff="exp")
def on_order_created(event):
    order = Order.objects.get(id=event.order_id)
    if order.status != Status.CONFIRMED:
        return
    PaymentService.capture(order)  # raises on timeout
