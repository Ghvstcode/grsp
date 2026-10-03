from dataclasses import dataclass
from decimal import Decimal


@dataclass(frozen=True)
class Money:
    amount: Decimal
    currency: str

    def __init__(self, amount, currency):
        object.__setattr__(self, "amount", Decimal(str(amount)))
        object.__setattr__(self, "currency", currency)

    def __gt__(self, other):
        if self.currency != other.currency:
            raise ValueError("cannot compare different currencies")
        return self.amount > other.amount

    def __add__(self, other):
        if self.currency != other.currency:
            raise ValueError("cannot add different currencies")
        return Money(self.amount + other.amount, self.currency)
