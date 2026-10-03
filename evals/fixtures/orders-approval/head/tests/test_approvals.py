import pytest

from approvals.service import ApprovalService, Forbidden, InvalidState
from orders.models import Status
from tests.factories import FakeRepo, make_order, make_user


def test_approver_confirms_a_pending_order():
    repo = FakeRepo([make_order(id=1, status=Status.PENDING_APPROVAL, created_by=7)])
    order = ApprovalService(repo).approve(1, approver=make_user(id=9))
    assert order.status is Status.CONFIRMED
    assert order.approved_by == 9


def test_creator_cannot_approve_their_own_order():
    repo = FakeRepo([make_order(id=1, status=Status.PENDING_APPROVAL, created_by=7)])
    with pytest.raises(Forbidden):
        ApprovalService(repo).approve(1, approver=make_user(id=7))


def test_only_pending_orders_can_be_approved():
    repo = FakeRepo([make_order(id=1, status=Status.CONFIRMED, created_by=7)])
    with pytest.raises(InvalidState):
        ApprovalService(repo).approve(1, approver=make_user(id=9))
