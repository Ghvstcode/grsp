import logging

from jobs.portal import PortalClient
from jobs.schedule import nightly
from orders import events
from orders.repository import OrderRepository

log = logging.getLogger(__name__)


@nightly(hour=2)
class BulkImportJob:
    """Imports the orders customers uploaded to the B2B portal as CSV."""

    def __init__(self, portal=None):
        self.portal = portal or PortalClient()

    def run(self):
        rows = self.portal.fetch_csv()
        valid = [r for r in rows if r.is_valid()]
        log.info("importing %d orders", len(valid))
        orders = OrderRepository().insert_many(valid)
        for order in orders:
            events.emit_order_created(order)
