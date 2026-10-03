import pytest

from orders.models import Status
from orders.services import OrderService
from tests.factories import FakeRepo, order_input


@pytest.mark.parametrize(
    "total, expected",
    [
        ("9999.00", Status.CONFIRMED),
        ("10000.00", Status.CONFIRMED),
        ("10000.01", Status.PENDING_APPROVAL),
    ],
)
def test_threshold_boundaries(total, expected):
    order = OrderService(FakeRepo()).create(order_input(total=total), created_by=7)
    assert order.status is expected
