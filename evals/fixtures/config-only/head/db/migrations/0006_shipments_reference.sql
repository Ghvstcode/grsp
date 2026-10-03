alter table shipments add column reference text;

create unique index shipments_reference_idx on shipments (reference);
