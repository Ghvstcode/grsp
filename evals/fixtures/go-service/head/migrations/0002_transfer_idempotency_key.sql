alter table transfers add column idempotency_key text;

create unique index transfers_idempotency_key_idx
    on transfers (from_account, idempotency_key)
    where idempotency_key is not null;
