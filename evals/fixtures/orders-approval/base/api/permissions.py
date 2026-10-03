from functools import wraps

from django.http import JsonResponse


def requires_auth(view):
    @wraps(view)
    def wrapper(request, *args, **kwargs):
        if not request.user.is_authenticated:
            return JsonResponse({"error": "unauthenticated"}, status=401)
        return view(request, *args, **kwargs)

    return wrapper

