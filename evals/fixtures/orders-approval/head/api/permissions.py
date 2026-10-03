from functools import wraps

from django.http import JsonResponse


def requires_auth(view):
    @wraps(view)
    def wrapper(request, *args, **kwargs):
        if not request.user.is_authenticated:
            return JsonResponse({"error": "unauthenticated"}, status=401)
        return view(request, *args, **kwargs)

    return wrapper


def requires_role(role):
    def decorator(view):
        @wraps(view)
        def wrapper(request, *args, **kwargs):
            if not request.user.is_authenticated:
                return JsonResponse({"error": "unauthenticated"}, status=401)
            if not request.user.has_role(role):
                return JsonResponse({"error": "forbidden"}, status=403)
            return view(request, *args, **kwargs)

        return wrapper

    return decorator
