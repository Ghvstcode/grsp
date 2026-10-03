import logging
import time

log = logging.getLogger(__name__)

_pending = []
dead_letters = []


def publish(event_name, payload):
    _pending.append((event_name, payload))


def run_with_retries(fn, event, retries, backoff):
    attempt = 0
    while True:
        try:
            return fn(event)
        except Exception:
            attempt += 1
            if attempt > retries:
                log.exception("giving up on %s", fn.__name__)
                dead_letters.append((fn.__name__, event))
                return None
            time.sleep(2**attempt if backoff == "exp" else 1)
