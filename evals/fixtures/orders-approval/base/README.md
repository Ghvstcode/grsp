# orders-api

Order intake for the B2B shop. Django, Postgres, a small event bus on top of the task queue.

- `api/` HTTP views and permissions
- `orders/` order model, service, repository, events and consumers
- `payments/` payment capture
- `jobs/` scheduled jobs (nightly CSV import from the B2B portal)
- `lib/` event bus and mailer

Orders are EUR only for now.
