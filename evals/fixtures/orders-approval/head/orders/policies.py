from enum import Enum

from orders.money import Money

THRESHOLD = Money("10000.00", "EUR")


class Decision(Enum):
    OK = "ok"
    REQUIRES_APPROVAL = "requires_approval"


class ApprovalPolicy:
    @staticmethod
    def check(order):
        if order.total > THRESHOLD:
            return Decision.REQUIRES_APPROVAL
        return Decision.OK
