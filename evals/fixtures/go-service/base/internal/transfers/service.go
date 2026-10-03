package transfers

import (
	"context"
	"errors"

	"example.com/ledgerd/internal/ledger"
	"example.com/ledgerd/internal/store"
)

var (
	ErrInvalid           = errors.New("invalid transfer")
	ErrInsufficientFunds = errors.New("insufficient funds")
)

type CreateInput struct {
	FromAccount string
	ToAccount   string
	AmountCents int64
}

type Service struct {
	db     *store.Store
	ledger *ledger.Ledger
}

func NewService(db *store.Store, l *ledger.Ledger) *Service {
	return &Service{db: db, ledger: l}
}

// Create moves money between two accounts.
func (s *Service) Create(ctx context.Context, in CreateInput) (*store.Transfer, error) {
	if in.FromAccount == "" || in.ToAccount == "" || in.FromAccount == in.ToAccount || in.AmountCents <= 0 {
		return nil, ErrInvalid
	}

	balance, err := s.ledger.Balance(ctx, in.FromAccount)
	if err != nil {
		return nil, err
	}
	if balance < in.AmountCents {
		return nil, ErrInsufficientFunds
	}

	t, err := s.db.InsertTransfer(ctx, store.Transfer{
		FromAccount: in.FromAccount,
		ToAccount:   in.ToAccount,
		AmountCents: in.AmountCents,
	})
	if err != nil {
		return nil, err
	}
	if err := s.ledger.Post(ctx, t.ID, in.FromAccount, in.ToAccount, in.AmountCents); err != nil {
		return nil, err
	}
	return t, nil
}

func (s *Service) Get(ctx context.Context, id string) (*store.Transfer, error) {
	return s.db.GetTransfer(ctx, id)
}
