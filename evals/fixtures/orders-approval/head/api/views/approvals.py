from django.http import JsonResponse
from django.views.decorators.http import require_POST

from api.permissions import requires_role
from approvals.service import ApprovalService, Forbidden, InvalidState


@require_POST
@requires_role("finance_approver")
def approve_order(request, order_id):
    try:
        order = ApprovalService().approve(order_id, approver=request.user)
    except InvalidState:
        return JsonResponse({"error": "order is not pending approval"}, status=409)
    except Forbidden as err:
        return JsonResponse({"error": str(err)}, status=403)
    return JsonResponse(order.to_dict())
