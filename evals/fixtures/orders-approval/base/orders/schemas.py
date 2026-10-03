from decimal import Decimal, InvalidOperation


class ValidationError(Exception):
    pass


class CreateOrderSchema:
    @staticmethod
    def validate(payload):
        if payload.get("currency") != "EUR":
            raise ValidationError("only EUR orders are supported")
        items = payload.get("items") or []
        if not items:
            raise ValidationError("an order needs at least one line item")
        cleaned = []
        for item in items:
            try:
                price = Decimal(str(item["unit_price"]))
                quantity = int(item["quantity"])
            except (KeyError, ValueError, InvalidOperation):
                raise ValidationError("invalid line item")
            if price <= 0 or quantity <= 0:
                raise ValidationError("price and quantity must be positive")
            cleaned.append({"sku": item["sku"], "unit_price": price, "quantity": quantity})
        return {
            "customer_id": int(payload["customer_id"]),
            "currency": "EUR",
            "items": cleaned,
        }
