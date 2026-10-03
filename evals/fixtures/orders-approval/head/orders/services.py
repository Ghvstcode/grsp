from orders import events
from orders.models import Order, Status
from orders.policies import ApprovalPolicy, Decision
from orders.repository import OrderRepository


class OrderService:
    def __init__(self, repo=None):
        self.repo = repo or OrderRepository()

    def create(self, data, created_by):
        order = Order.from_input(data, created_by=created_by)
        decision = ApprovalPolicy.check(order)
        if decision is Decision.REQUIRES_APPROVAL:
            order.status = Status.PENDING_APPROVAL
        else:
            order.status = Status.CONFIRMED
        self.repo.insert(order)
        if order.status is Status.PENDING_APPROVAL:
            events.emit_approval_requested(order)
        else:
            events.emit_order_created(order)
        return order
