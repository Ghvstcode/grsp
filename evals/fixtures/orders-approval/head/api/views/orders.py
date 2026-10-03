import json

from django.http import JsonResponse
from django.views.decorators.http import require_GET, require_POST

from api.permissions import requires_auth
from orders.repository import OrderRepository
from orders.schemas import CreateOrderSchema, ValidationError
from orders.services import OrderService


@require_POST
@requires_auth
def create_order(request):
    try:
        data = CreateOrderSchema.validate(json.loads(request.body))
    except ValidationError as err:
        return JsonResponse({"error": str(err)}, status=422)
    order = OrderService().create(data, created_by=request.user.id)
    return JsonResponse(order.to_dict(), status=201)


@require_GET
@requires_auth
def get_order(request, order_id):
    order = OrderRepository().get(order_id)
    return JsonResponse(order.to_dict())
