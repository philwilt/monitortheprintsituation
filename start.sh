#!/bin/bash
set -e

# Ensure Docker Desktop is running (macOS)
if ! docker info &>/dev/null; then
  echo "Starting Docker Desktop..."
  open -a Docker
  echo "Waiting for Docker..."
  until docker info &>/dev/null; do
    sleep 2
  done
fi

echo "Starting database..."
npm run db

echo "Waiting for Postgres..."
until docker compose exec -T db pg_isready -U situation -d thesituation 2>/dev/null; do
  sleep 1
done

echo "Postgres ready. Starting dev server..."
npm run dev
