package transfers

import (
	"context"
	"errors"
	"testing"
)

func TestCreateRejectsSameAccount(t *testing.T) {
	svc := NewService(nil, nil)
	_, err := svc.Create(context.Background(), CreateInput{FromAccount: "a", ToAccount: "a", AmountCents: 100})
	if !errors.Is(err, ErrInvalid) {
		t.Fatalf("expected ErrInvalid, got %v", err)
	}
}

func TestCreateRejectsNonPositiveAmount(t *testing.T) {
	svc := NewService(nil, nil)
	_, err := svc.Create(context.Background(), CreateInput{FromAccount: "a", ToAccount: "b", AmountCents: 0})
	if !errors.Is(err, ErrInvalid) {
		t.Fatalf("expected ErrInvalid, got %v", err)
	}
}
