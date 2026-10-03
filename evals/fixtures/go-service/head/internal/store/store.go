package store

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Store struct {
	pool *pgxpool.Pool
}

func New(pool *pgxpool.Pool) *Store {
	return &Store{pool: pool}
}

type Transfer struct {
	ID             string `json:"id"`
	FromAccount    string `json:"from_account"`
	ToAccount      string `json:"to_account"`
	AmountCents    int64  `json:"amount_cents"`
	IdempotencyKey string `json:"-"`
}

type Posting struct {
	TransferID  string
	Account     string
	AmountCents int64
}

func (s *Store) InsertTransfer(ctx context.Context, t Transfer) (*Transfer, error) {
	row := s.pool.QueryRow(ctx,
		`insert into transfers (from_account, to_account, amount_cents, idempotency_key)
		 values ($1, $2, $3, nullif($4, '')) returning id`,
		t.FromAccount, t.ToAccount, t.AmountCents, t.IdempotencyKey)
	if err := row.Scan(&t.ID); err != nil {
		return nil, err
	}
	return &t, nil
}

// FindTransferByKey returns the transfer created earlier with this key by the
// same source account, or nil when there is none.
func (s *Store) FindTransferByKey(ctx context.Context, fromAccount, key string) (*Transfer, error) {
	var t Transfer
	err := s.pool.QueryRow(ctx,
		`select id, from_account, to_account, amount_cents from transfers
		 where from_account = $1 and idempotency_key = $2`,
		fromAccount, key).Scan(&t.ID, &t.FromAccount, &t.ToAccount, &t.AmountCents)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	t.IdempotencyKey = key
	return &t, nil
}

func (s *Store) GetTransfer(ctx context.Context, id string) (*Transfer, error) {
	var t Transfer
	err := s.pool.QueryRow(ctx,
		`select id, from_account, to_account, amount_cents from transfers where id = $1`, id).
		Scan(&t.ID, &t.FromAccount, &t.ToAccount, &t.AmountCents)
	if err != nil {
		return nil, err
	}
	return &t, nil
}

func (s *Store) SumPostings(ctx context.Context, account string) (int64, error) {
	var sum int64
	err := s.pool.QueryRow(ctx,
		`select coalesce(sum(amount_cents), 0) from postings where account = $1`, account).Scan(&sum)
	return sum, err
}

func (s *Store) InsertPostings(ctx context.Context, postings []Posting) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	for _, p := range postings {
		if _, err := tx.Exec(ctx,
			`insert into postings (transfer_id, account, amount_cents) values ($1, $2, $3)`,
			p.TransferID, p.Account, p.AmountCents); err != nil {
			return err
		}
	}
	return tx.Commit(ctx)
}
