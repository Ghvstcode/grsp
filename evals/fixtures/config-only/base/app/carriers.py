import requests

from app import settings
from app.db import pool


def poll_carrier(shipment_id):
    response = requests.get(
        f"https://carriers.internal/track/{shipment_id}",
        timeout=settings.REQUEST_TIMEOUT_SECONDS,
    )
    response.raise_for_status()
    with pool.connection() as conn:
        conn.execute(
            "update shipments set status = %s where id = %s",
            (response.json()["status"], shipment_id),
        )
