# Swimmer Tracker (Excel ➜ Mobile App)

Multi-user swim log with Supabase Auth, competition results, and auto-calculated personal bests by distance & stroke. Mobile-first UI, CSV import/export, offline-friendly.

## One‑Click Deploy

1. **Create Supabase project** (free). Get your **Project URL** and **anon key**.
2. **Click this button** after you push this repo to GitHub (Vercel requires a repo):

   [![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone)

   - When prompted, set environment variables:
     - `VITE_SUPABASE_URL`
     - `VITE_SUPABASE_ANON_KEY`
3. In Supabase web console → **SQL Editor** → paste contents of `supabase/schema.sql` → **Run**.
4. In Authentication → Providers: enable Email (magic link). Optionally enable Google & Apple. Set redirect URL to your Vercel domain.
5. Open the deployed site, sign in, and start logging.
6. To preload your existing Excel data: open the app and use **Import CSV** (use `seed/seed_workouts.csv`).

> Tip: You can also deploy locally with `npm i && npm run dev`.

## Project Structure

```
/
├─ supabase/
│  └─ schema.sql
├─ seed/
│  └─ seed_workouts.csv
├─ src/
│  ├─ App.tsx
│  ├─ main.tsx
│  └─ index.css
├─ index.html
├─ package.json
├─ vite.config.ts
├─ tailwind.config.js
├─ postcss.config.js
├─ .env.example
└─ vercel.json
```

## Privacy & Security

- Row Level Security ensures each user can access **only** their own data.
- No sensitive keys on the client except the public anon key.
- Optional OAuth via Google/Apple.

## Import/Export

- Import: CSV headers: `date,distance_m,duration_min,stroke,rpe,notes`
- Export: Click **Export CSV** inside the app.
