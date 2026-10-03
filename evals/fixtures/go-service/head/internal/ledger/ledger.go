package ledger

import (
	"context"

	"example.com/ledgerd/internal/store"
)

type Ledger struct {
	db *store.Store
}

func New(db *store.Store) *Ledger {
	return &Ledger{db: db}
}

// Balance sums every posting for the account.
func (l *Ledger) Balance(ctx context.Context, account string) (int64, error) {
	return l.db.SumPostings(ctx, account)
}

// Post writes the debit and the credit for a transfer in one transaction.
func (l *Ledger) Post(ctx context.Context, transferID, from, to string, amountCents int64) error {
	return l.db.InsertPostings(ctx, []store.Posting{
		{TransferID: transferID, Account: from, AmountCents: -amountCents},
		{TransferID: transferID, Account: to, AmountCents: amountCents},
	})
}
