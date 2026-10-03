-- The dashboard's status tabs and the worker both filter by status and sort
-- by created_at. Without this they scan the whole table.
create index concurrently if not exists shipments_status_created_at_idx
    on shipments (status, created_at desc);
