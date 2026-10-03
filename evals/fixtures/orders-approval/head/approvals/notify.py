import logging

from accounts.models import User
from lib import mailer
from lib.mailer import MailerError

log = logging.getLogger(__name__)


def approval_email(order):
    return {
        "subject": f"Order {order.id} needs your approval",
        "body": f"Order {order.id} for {order.total_amount} {order.currency} is waiting for a second approval.",
    }


def notify_approvers(order):
    approvers = User.objects.with_role("finance_approver")
    for user in approvers:
        try:
            mailer.send(user.email, approval_email(order))
        except MailerError:
            log.warning("approval email failed for order %s", order.id)
