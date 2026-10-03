from app.db import pool


def shipments_by_status(status, limit=50):
    """Newest shipments in a given status. Backs the dashboard's status tabs."""
    with pool.connection() as conn:
        return conn.execute(
            "select id, reference, status, created_at from shipments "
            "where status = %s order by created_at desc limit %s",
            (status, limit),
        ).fetchall()
