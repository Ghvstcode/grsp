import requests

from django.conf import settings


class GatewayTimeout(Exception):
    pass


class Gateway:
    def capture(self, reference, amount, currency, timeout):
        try:
            response = requests.post(
                f"{settings.PAYMENTS_URL}/captures",
                json={"reference": reference, "amount": str(amount), "currency": currency},
                timeout=timeout,
            )
        except requests.Timeout as err:
            raise GatewayTimeout(reference) from err
        response.raise_for_status()
        return response.json()


gateway = Gateway()
