from orders import events
from orders.models import Status
from orders.repository import OrderRepository


class InvalidState(Exception):
    pass


class Forbidden(Exception):
    pass


class ApprovalService:
    def __init__(self, repo=None):
        self.repo = repo or OrderRepository()

    def approve(self, order_id, approver):
        order = self.repo.get(order_id)
        if order.status != Status.PENDING_APPROVAL:
            raise InvalidState()
        if approver.id == order.created_by:
            raise Forbidden("cannot approve own order")
        order.confirm(approved_by=approver.id)
        self.repo.update(order)
        events.emit_order_created(order)
        return order
