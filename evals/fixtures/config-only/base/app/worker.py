from concurrent.futures import ThreadPoolExecutor

from app import settings
from app.carriers import poll_carrier
from app.db import pool


def run_once():
    with pool.connection() as conn:
        due = conn.execute(
            "select id from shipments where status = 'in_transit' order by created_at desc limit 500"
        ).fetchall()
    with ThreadPoolExecutor(max_workers=settings.WORKER_CONCURRENCY) as executor:
        list(executor.map(lambda row: poll_carrier(row[0]), due))
