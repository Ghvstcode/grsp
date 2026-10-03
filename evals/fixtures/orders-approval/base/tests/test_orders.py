from orders.models import Status
from orders.services import OrderService
from tests.factories import FakeRepo, order_input


def test_create_saves_the_order():
    repo = FakeRepo()
    order = OrderService(repo).create(order_input(total="120.00"), created_by=7)
    assert repo.inserted == [order]
    assert order.status is Status.CONFIRMED
