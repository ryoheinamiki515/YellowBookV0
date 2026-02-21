# Development Guide

This repo has separate projects. Run commands from the correct folder:

- API: `/Users/ryoheinamiki515/YellowBookV0/api`
- Mobile (Expo): `/Users/ryoheinamiki515/YellowBookV0/mobile`
- DB (Postgres via Docker): from repo root `/Users/ryoheinamiki515/YellowBookV0`

## Why `npx start` fails

`npx start` tries to find an npm package named `start` with an executable. There is no such package here, so npm shows:

`npm error could not determine executable to run`

Use npm scripts instead:

- `npm run dev` (API, inside `api`)
- `npm run start` (Expo, inside `mobile`)

## 1) Start the database

From repo root:

```bash
cd /Users/ryoheinamiki515/YellowBookV0
docker compose up -d db
docker compose ps
```

Expected: service `db` is `Up` on port `5432`.

## 2) Start the API

Open a new terminal:

```bash
cd /Users/ryoheinamiki515/YellowBookV0/api
npm install
npx prisma migrate deploy
npm run dev
```

Expected log:

`API listening on :3000`

### API env requirements (`api/.env`)

- `PORT`
- `DATABASE_URL`
- `AUTH0_ISSUER_BASE_URL`
- `AUTH0_AUDIENCE`

Note: `DATABASE_URL` should point to the Postgres container (`localhost:5432` is correct when Docker is running locally).

## 3) Start the Expo app

Open another terminal:

```bash
cd /Users/ryoheinamiki515/YellowBookV0/mobile
npm install
npm run start
```

Then choose:

- `i` for iOS simulator
- `a` for Android emulator
- `w` for web
- Or scan QR in Expo Go

### Mobile env requirements (`mobile/.env`)

- `EXPO_PUBLIC_API_BASE_URL`
- `EXPO_PUBLIC_AUTH0_DOMAIN`
- `EXPO_PUBLIC_AUTH0_CLIENT_ID`
- `EXPO_PUBLIC_AUTH0_AUDIENCE`

Set `EXPO_PUBLIC_API_BASE_URL` to where your API is reachable:

- iOS simulator: `http://localhost:3000`
- Android emulator: `http://10.0.2.2:3000`
- Physical device: `http://<your-computer-lan-ip>:3000`

## Recommended terminal layout

- Terminal 1: DB (`docker compose up -d db`)
- Terminal 2: API (`npm run dev` in `api`)
- Terminal 3: Mobile (`npm run start` in `mobile`)

## Helpful checks

From API terminal:

```bash
curl http://localhost:3000/v1/health
```

Should return JSON with `"status":"ok"`.

## Stopping everything

- Stop Expo/API with `Ctrl+C` in their terminals
- Stop DB from repo root:

```bash
docker compose down
```
