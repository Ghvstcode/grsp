import os

DATABASE_URL = os.environ["DATABASE_URL"]
DB_POOL_SIZE = int(os.environ.get("DB_POOL_SIZE", "5"))
WORKER_CONCURRENCY = int(os.environ.get("WORKER_CONCURRENCY", "4"))
REQUEST_TIMEOUT_SECONDS = int(os.environ.get("REQUEST_TIMEOUT_SECONDS", "30"))
