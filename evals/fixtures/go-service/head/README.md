# ledgerd

Small Go service that moves money between accounts.

- `cmd/server` wires everything together and serves HTTP on :8080
- `internal/httpapi` handlers and routing
- `internal/transfers` transfer creation
- `internal/ledger` double-entry postings
- `internal/store` Postgres access
