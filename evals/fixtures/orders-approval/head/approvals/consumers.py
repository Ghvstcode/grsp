from approvals.notify import notify_approvers
from lib.events import consumer
from orders.models import Order


@consumer("approval.requested")
def on_approval_requested(event):
    order = Order.objects.get(id=event.order_id)
    notify_approvers(order)
