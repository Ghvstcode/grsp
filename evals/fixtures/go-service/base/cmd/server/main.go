package main

import (
	"context"
	"log"
	"net/http"
	"os"

	"github.com/jackc/pgx/v5/pgxpool"

	"example.com/ledgerd/internal/httpapi"
	"example.com/ledgerd/internal/ledger"
	"example.com/ledgerd/internal/store"
	"example.com/ledgerd/internal/transfers"
)

func main() {
	pool, err := pgxpool.New(context.Background(), os.Getenv("DATABASE_URL"))
	if err != nil {
		log.Fatal(err)
	}
	db := store.New(pool)
	svc := transfers.NewService(db, ledger.New(db))

	mux := http.NewServeMux()
	httpapi.Register(mux, svc)
	log.Fatal(http.ListenAndServe(":8080", mux))
}
