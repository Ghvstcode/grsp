from enum import Enum

from django.db import models

from orders.money import Money


class Status(str, Enum):
    CONFIRMED = "confirmed"
    CANCELLED = "cancelled"


class Order(models.Model):
    customer_id = models.IntegerField()
    created_by = models.IntegerField()
    total_amount = models.DecimalField(max_digits=12, decimal_places=2)
    currency = models.CharField(max_length=3, default="EUR")
    status = models.CharField(max_length=16)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "orders"

    @property
    def total(self):
        return Money(self.total_amount, self.currency)

    @classmethod
    def from_input(cls, data, created_by):
        total = sum(item["unit_price"] * item["quantity"] for item in data["items"])
        return cls(
            customer_id=data["customer_id"],
            created_by=created_by,
            total_amount=total,
            currency=data["currency"],
        )

    @classmethod
    def from_row(cls, row):
        return cls(
            customer_id=row.customer_id,
            created_by=row.imported_by,
            total_amount=row.total,
            currency="EUR",
        )

    def to_dict(self):
        return {
            "id": self.id,
            "status": Status(self.status).value,
            "total": str(self.total_amount),
            "currency": self.currency,
        }
