create table transfers (
    id uuid primary key default gen_random_uuid(),
    from_account text not null,
    to_account text not null,
    amount_cents bigint not null check (amount_cents > 0),
    created_at timestamptz not null default now()
);

create table postings (
    id bigserial primary key,
    transfer_id uuid not null references transfers (id),
    account text not null,
    amount_cents bigint not null
);

create index postings_account_idx on postings (account);
