from types import SimpleNamespace

from django.db import transaction

from lib import queue

_consumers = {}


def consumer(event_name, retries=0, backoff=None):
    def register(fn):
        _consumers.setdefault(event_name, []).append((fn, retries, backoff))
        return fn

    return register


def emit(event_name, **payload):
    # Published after the surrounding transaction commits.
    transaction.on_commit(lambda: queue.publish(event_name, payload))


def dispatch(event_name, payload):
    for fn, retries, backoff in _consumers.get(event_name, []):
        queue.run_with_retries(fn, SimpleNamespace(**payload), retries=retries, backoff=backoff)
