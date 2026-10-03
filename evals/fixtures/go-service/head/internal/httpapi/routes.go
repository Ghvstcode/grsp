package httpapi

import (
	"net/http"

	"example.com/ledgerd/internal/transfers"
)

// Register mounts the HTTP API.
func Register(mux *http.ServeMux, svc *transfers.Service) {
	h := &handlers{svc: svc}
	mux.HandleFunc("POST /v1/transfers", h.createTransfer)
	mux.HandleFunc("GET /v1/transfers/{id}", h.getTransfer)
}
