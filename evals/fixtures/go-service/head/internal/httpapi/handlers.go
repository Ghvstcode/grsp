package httpapi

import (
	"encoding/json"
	"errors"
	"net/http"

	"example.com/ledgerd/internal/transfers"
)

type handlers struct {
	svc *transfers.Service
}

type createTransferRequest struct {
	FromAccount string `json:"from_account"`
	ToAccount   string `json:"to_account"`
	AmountCents int64  `json:"amount_cents"`
}

func (h *handlers) createTransfer(w http.ResponseWriter, r *http.Request) {
	var req createTransferRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_json")
		return
	}

	t, created, err := h.svc.Create(r.Context(), transfers.CreateInput{
		FromAccount:    req.FromAccount,
		ToAccount:      req.ToAccount,
		AmountCents:    req.AmountCents,
		IdempotencyKey: r.Header.Get("Idempotency-Key"),
	})
	switch {
	case errors.Is(err, transfers.ErrInvalid):
		writeError(w, http.StatusUnprocessableEntity, "invalid_transfer")
		return
	case errors.Is(err, transfers.ErrInsufficientFunds):
		writeError(w, http.StatusConflict, "insufficient_funds")
		return
	case err != nil:
		writeError(w, http.StatusInternalServerError, "internal_error")
		return
	}

	status := http.StatusCreated
	if !created {
		status = http.StatusOK
	}
	writeJSON(w, status, t)
}

func (h *handlers) getTransfer(w http.ResponseWriter, r *http.Request) {
	t, err := h.svc.Get(r.Context(), r.PathValue("id"))
	if err != nil {
		writeError(w, http.StatusNotFound, "not_found")
		return
	}
	writeJSON(w, http.StatusOK, t)
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func writeError(w http.ResponseWriter, status int, code string) {
	writeJSON(w, status, map[string]string{"error": code})
}
