from payments.gateway import GatewayTimeout, gateway


class PaymentTimeout(Exception):
    pass


class PaymentService:
    @staticmethod
    def capture(order):
        try:
            return gateway.capture(
                reference=f"order-{order.id}",
                amount=order.total_amount,
                currency=order.currency,
                timeout=10,
            )
        except GatewayTimeout as err:
            raise PaymentTimeout(str(err)) from err
