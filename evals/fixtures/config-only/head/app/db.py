from psycopg_pool import ConnectionPool

from app import settings

pool = ConnectionPool(settings.DATABASE_URL, max_size=settings.DB_POOL_SIZE)
