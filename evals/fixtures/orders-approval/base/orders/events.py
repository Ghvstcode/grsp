from lib import events as bus

ORDER_CREATED = "order.created"


def emit_order_created(order):
    bus.emit(ORDER_CREATED, order_id=order.id)
