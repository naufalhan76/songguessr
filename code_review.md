# 🎵 Songguessr - Code Review & Feature Audit

## Overview

Songguessr adalah monorepo real-time multiplayer music guessing game. Berikut breakdown status lengkap fitur, masalah, dan rekomendasi.

---

## Feature Checklist vs README Roadmap

| # | Feature (dari README) | Status | Detail |
|---|---|---|---|
| 1 | Project architecture & data models | ✅ Done | [ARCHITECTURE.md](file:///a:/Songguessr/ARCHITECTURE.md), shared [types.ts](file:///a:/Songguessr/packages/shared/src/types.ts), SQL migration |
| 2 | Monorepo setup with Next.js frontend | ✅ Done | Workspace config, packages/shared, apps/frontend |
| 3 | Room lobby UI boilerplate | ✅ Done | [RoomLobby.tsx](file:///a:/Songguessr/apps/frontend/components/RoomLobby.tsx) (tapi pakai **mock data**) |
| 4 | Supabase migration schema | ✅ Done | [0001_initial_schema.sql](file:///a:/Songguessr/apps/backend/supabase/migrations/0001_initial_schema.sql) — RLS, indexes, realtime publication |
| 5 | Supabase Auth with Spotify OAuth | ⚠️ Partial | [supabase.ts](file:///a:/Songguessr/apps/frontend/lib/supabase.ts) punya [signInWithSpotify()](file:///a:/Songguessr/apps/frontend/lib/supabase.ts#23-36), auth callback page ada, tapi **belum connect ke real data** |
| 6 | Real-time room synchronization | ❌ Missing | **Tidak ada Supabase Realtime subscription** di frontend sama sekali |
| 7 | Spotify track fetching & caching | ❌ Missing | Tidak ada API route/function untuk fetch tracks dari Spotify |
| 8 | Quiz game UI with audio player | ❌ Missing | Tidak ada game/quiz component, tidak ada audio player |
| 9 | Scoring system & leaderboard | ❌ Missing | [calculateScore()](file:///a:/Songguessr/packages/shared/src/index.ts#13-25) ada di shared, tapi **tidak ada leaderboard UI** |
| 10 | Mobile responsiveness & polish | ⚠️ Partial | Responsive classes ada, tapi belum di-test dan belum polished |
| 11 | Deployment to Vercel & Supabase | ⚠️ Partial | Config ada, tapi credentials di [.env.example](file:///a:/Songguessr/apps/frontend/.env.example) = **real keys yang ke-expose** |

---

## 🔴 Critical Issues

### 1. Exposed Secrets di [.env.example](file:///a:/Songguessr/apps/frontend/.env.example)
File [.env.example](file:///a:/Songguessr/apps/frontend/.env.example) mengandung **real Supabase URL, anon key, Spotify client ID, dan client secret**. Ini seharusnya placeholder, bukan real credentials.

> [!CAUTION]
> **Segera rotate semua credentials ini!** Supabase anon key, Spotify Client ID & Secret sudah terexpose di repo. Ganti di Supabase dashboard dan Spotify developer dashboard.

### 2. Semua Data di RoomLobby = Mock/Hardcoded
[RoomLobby.tsx](file:///a:/Songguessr/apps/frontend/components/RoomLobby.tsx) menggunakan `mockRoom`, `mockPlayers`, `mockUser` — tidak ada koneksi ke Supabase. Ini artinya:
- Room tidak benar-benar dibuat di database
- Player join/leave tidak sync
- Ready status tidak broadcast ke player lain
- Game start tidak trigger apapun

### 3. Auth Callback `searchParams` Pattern (Next.js 15)
Di [app/auth/callback/page.tsx](file:///a:/Songguessr/apps/frontend/app/auth/callback/page.tsx), `searchParams` diakses langsung sebagai prop — di Next.js 15 (App Router), `searchParams` harus di-`await` karena sekarang berupa `Promise`. Ini akan crash di runtime.

---

## 🟡 Missing Core Features (Belum Diimplementasi)

### A. Real-time Room Sync
- Tidak ada `supabase.channel()` subscription di [RoomLobby](file:///a:/Songguessr/apps/frontend/components/RoomLobby.tsx#47-513)
- Player join/leave/ready tidak di-broadcast via Realtime
- Room status changes tidak di-sync

### B. Spotify Track Fetching
- Tidak ada API route `/api/spotify/tracks`
- Tidak ada logic untuk fetch user top tracks / recently played
- Tidak ada track pooling logic (combine tracks dari semua player)

### C. Quiz/Game Play UI
- Tidak ada game round component
- Tidak ada audio player (30s preview)
- Tidak ada multiple choice answer UI
- Tidak ada timer countdown per round
- `room.status === 'active'` tidak di-handle (tidak ada game phase UI)

### D. Leaderboard / Results
- Tidak ada leaderboard/results page setelah game selesai
- `room.status === 'finished'` tidak di-handle

### E. Room Creation di Backend
- [handleCreateRoom](file:///a:/Songguessr/apps/frontend/components/LandingPage.tsx#34-38) di [LandingPage.tsx](file:///a:/Songguessr/apps/frontend/components/LandingPage.tsx) hanya generate room code dan navigate — tidak ada insert ke Supabase `rooms` table

---

## 🟢 What's Working Well

| Area | Notes |
|---|---|
| **Type system** | Shared types lengkap dan konsisten dengan SQL schema |
| **SQL Migration** | Well-structured: RLS policies, indexes, realtime publications, constraints |
| **UI Design** | Clean monochrome aesthetic, HeroUI + Framer Motion animations, QR code untuk mobile join |
| **Auth flow structure** | OAuth flow logic ada (redirect → callback → session exchange) |
| **Scoring formula** | [calculateScore()](file:///a:/Songguessr/packages/shared/src/index.ts#13-25) di shared package siap pakai |
| **Room code generator** | Avoids ambiguous chars (I, O, 0, 1), good UX |
| **Countdown overlay** | Smooth Framer Motion countdown sebelum game start |
| **Layout & CSS** | Dark theme, grid background, custom scrollbar, Google Fonts (Sora + IBM Plex Mono) |

---

## 🔧 Code Quality Issues

### 1. `socket.io-client` di Dependencies Tapi Tidak Digunakan
[package.json](file:///a:/Songguessr/package.json) punya `socket.io-client` tapi project pakai Supabase Realtime. Ini bagian dari dependency yang tidak terpakai.

### 2. Missing `max_players` di SQL Default
SQL migration default settings JSON tidak include `max_players`, tapi TypeScript [RoomSettings](file:///a:/Songguessr/packages/shared/src/types.ts#26-33) type punya field `max_players`. Ini bisa mismatch.

### 3. `select` Dropdown Option Values = String
Semua `<option>` values di game settings (rounds, time, max players) tidak punya explicit `value` attribute — mereka pakai text content sebagai value. Ini works tapi fragile.

### 4. Duplicate Background Effects
[layout.tsx](file:///a:/Songguessr/apps/frontend/app/layout.tsx) punya inline radial gradient + grid background, DAN [globals.css](file:///a:/Songguessr/apps/frontend/app/globals.css) punya `body::before` + `body::after` yang melakukan hal yang sama. Visual akan double-layered.

### 5. [handleConnectSpotify](file:///a:/Songguessr/apps/frontend/components/RoomLobby.tsx#106-118) Langsung Set `hasSpotify = true`
Di line 108 [RoomLobby.tsx](file:///a:/Songguessr/apps/frontend/components/RoomLobby.tsx), `setHasSpotify(true)` dipanggil sebelum OAuth sebenarnya selesai. Ini premature — user bisa gagal auth tapi UI sudah show "connected".

---

## Summary

**Status keseluruhan**: Project ini masih di tahap **UI boilerplate + database schema**. Dari 11 roadmap items, hanya **4 yang done**, **3 partial**, dan **4 completely missing**.

Fitur-fitur inti yang membuat game ini playable **(real-time sync, Spotify track fetch, quiz UI, audio player, leaderboard)** semuanya belum ada.

> [!IMPORTANT]
> Apakah kamu mau gw bantu implementasi fitur-fitur yang missing? Gw bisa prioritasin berdasarkan game flow:
> 1. Fix auth + real room creation (Supabase)
> 2. Real-time room sync
> 3. Spotify track fetching
> 4. Quiz game UI + audio player
> 5. Scoring + leaderboard
