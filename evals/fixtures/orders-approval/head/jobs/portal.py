import csv
import io
from dataclasses import dataclass
from decimal import Decimal

import requests
from django.conf import settings


@dataclass
class PortalRow:
    customer_id: int
    imported_by: int
    total: Decimal

    def is_valid(self):
        return self.customer_id > 0 and self.total > 0


class PortalClient:
    def fetch_csv(self):
        response = requests.get(f"{settings.PORTAL_URL}/exports/orders.csv", timeout=30)
        response.raise_for_status()
        reader = csv.DictReader(io.StringIO(response.text))
        return [
            PortalRow(int(r["customer_id"]), int(r["uploaded_by"]), Decimal(r["total_eur"]))
            for r in reader
        ]
