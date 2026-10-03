from lib import events as bus

ORDER_CREATED = "order.created"
APPROVAL_REQUESTED = "approval.requested"


def emit_order_created(order):
    bus.emit(ORDER_CREATED, order_id=order.id)


def emit_approval_requested(order):
    bus.emit(APPROVAL_REQUESTED, order_id=order.id)
