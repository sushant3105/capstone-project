# Wayfarer · Personalized Travel Itinerary Planner

A compact, full-stack AI travel planner built for a single free Vercel deployment.

- **Frontend:** React + Vite
- **API:** FastAPI on Vercel's Python runtime
- **Auth, database, collaboration:** Supabase Auth + Postgres + Row Level Security + Realtime
- **AI:** Google Gemini API. Each signed-in user enters their own key when prompted; the app keeps it in React memory only.
- **Hosting target:** one Vercel project. No separate paid backend, map provider, vector database, or hosted model is required.

## Features

- Email/password sign-up and sign-in through Supabase.
- Build personalized day-by-day itineraries from destination, dates, budget, currency, interests, style, pace, group size and notes.
- See activity timing, locations, estimated costs, accommodation guidance, transport notes and a budget breakdown.
- Edit activity titles/descriptions, rename a trip, and regenerate one day without replacing the whole itinerary.
- Save trips in Supabase and share a seven-day invite link. Signed-in collaborators can edit the same itinerary; Supabase Realtime broadcasts trip updates.
- Row Level Security keeps trip data private to its owner and invited members. The Supabase service-role key is not used.
- The Gemini key is never written to localStorage, sessionStorage, Supabase or a project environment variable. A refresh/sign-out clears it.

## Free setup checklist

The basic project is designed for free tiers, subject to each provider’s quotas, eligibility rules and terms. No paid API is required by this code. Free quotas can change, and no hosting provider guarantees that every account remains free under every usage pattern.

1. **Supabase:** create a free project at [supabase.com/dashboard](https://supabase.com/dashboard). In **SQL Editor**, run [`supabase/schema.sql`](supabase/schema.sql) once. In **Project Settings → API**, copy the Project URL and the publishable/anon key. Do not use the `service_role` key.
2. **Gemini:** create a key at [Google AI Studio](https://aistudio.google.com/apikey). You do not put this in Vercel. The app asks each user for their own key in the UI.
3. **Vercel:** import this repository from GitHub as one project. Keep the root directory as the project root and use the FastAPI framework preset. `pyproject.toml` defines the Vercel build command: `npm install --no-audit --no-fund && npm run build`. This deliberately does not require a checked-in npm lockfile. The FastAPI preset serves the built `dist/` frontend and `/api/*` endpoints in the same Vercel deployment; `vercel.json` includes the built files in the Python function bundle.
4. Add these environment variables in **Vercel → Project → Settings → Environment Variables**, for Preview and Production (and Development if you use it):

   | Variable | Value |
   | --- | --- |
   | `VITE_SUPABASE_URL` | Your Supabase Project URL |
   | `VITE_SUPABASE_ANON_KEY` | Your Supabase publishable/anon key |
   | `SUPABASE_URL` | The same Supabase Project URL |
   | `SUPABASE_ANON_KEY` | The same Supabase publishable/anon key |

   The two `VITE_` variables are injected into the frontend at build time. The non-prefixed pair is used by FastAPI to validate the signed-in session. These are public project values, not service-role secrets. Never add your Supabase `service_role` key or anyone’s Gemini key to Vercel for this setup.
5. Deploy or redeploy. Open the Vercel URL, create an account, and enter the Gemini key in the key dialog. If Supabase email confirmation is enabled, confirm the signup email before signing in.

### Supabase settings for a simple demo

- In **Authentication → URL Configuration**, set the Site URL to your Vercel deployment URL. Add any Vercel preview URL you use to the redirect allow list.
- Email/password authentication is enabled by default. To make a classroom/demo setup less fiddly, you can turn off email confirmation in Supabase Auth settings. For a public app, keep confirmation enabled and configure auth policies appropriately.
- `supabase/schema.sql` enables RLS, creates the trip membership and invite functions, and attempts to enable Realtime for the `trips` table. If your project's database role does not allow the publication change, enable `public.trips` under **Database → Replication** in the Supabase dashboard.

## Run locally

Requirements: Node.js 20+ and Python 3.12+.

```bash
# 1. Install JavaScript and Python dependencies
npm install
python -m venv .venv

# macOS/Linux
source .venv/bin/activate

# Windows PowerShell equivalent:
# .\.venv\Scripts\Activate.ps1

pip install -r requirements.txt

# 2. Create local environment values
cp .env.example .env
# Fill in the four Supabase values in .env. Never commit .env.

# 3. Terminal A: start FastAPI
uvicorn main:app --reload --port 8000

# 4. Terminal B: start React/Vite
npm run dev
```

Open the local Vite URL printed in Terminal B (usually `http://localhost:5173`). Vite proxies `/api` requests to FastAPI on port 8000. To test the same static-file setup as deployment, run `npm run build` first and then visit the FastAPI URL.

## API endpoints

- `GET /api/health` - health check.
- `POST /api/generate` - generate a complete itinerary.
- `POST /api/regenerate-day` - replace a single itinerary day.

AI endpoints require a valid Supabase bearer token and an `x-gemini-api-key` request header. The Gemini key is not accepted in request JSON or written to server logs by this app.

## Free-tier and safety notes

- **Vercel Hobby:** free for personal projects and prototypes, with usage and function-duration limits. Vercel documents the Hobby plan as non-commercial/personal use. FastAPI runs as a serverless function, not as a permanently running process. Check the latest plan terms before using this for a commercial product.
- **Supabase Free:** has storage/usage limits and free projects may pause after roughly a week of low activity. A paused project can be restored from the dashboard; it is not a guarantee of always-on production hosting.
- **Gemini free tier:** Google currently lists `gemini-3.5-flash-lite` with free input and output tokens, with model access and request limits still subject to your account and quota. If it is unavailable to your key, set `GEMINI_MODEL` to a model currently shown as available in your Google AI Studio account. The app does not configure billing or need a shared paid key.
- Google documents that content submitted under its Gemini API free tier may be used to improve its products. Do not enter secrets or sensitive personal information into travel notes.
- Itinerary place suggestions, schedules, prices, routes and costs are AI-generated estimates, not live-verified information or bookings. Confirm details with official providers before traveling.
- Shared invite links allow the recipient to join as an editor until the link expires. Treat them like access links and only share with trusted people.

## Project layout

```text
.
├── main.py                # FastAPI application + Gemini integration
├── pyproject.toml         # Vercel Python project and frontend build command
├── requirements.txt       # Python dependencies
├── package.json           # React/Vite scripts and dependencies
├── src/
│   ├── App.jsx            # Dashboard, auth, builder, itinerary and modals
│   ├── styles.css         # Responsive SaaS-style UI
│   ├── main.jsx           # React entry point
│   └── supabase.js        # Supabase browser client
└── supabase/schema.sql    # Tables, RLS, invite RPCs and realtime setup
```

## Troubleshooting

- **“Supabase is not configured”:** set all four environment variables in Vercel and redeploy so the `VITE_` variables are rebuilt into the frontend.
- **Sign-up works but sign-in does not:** check whether Supabase email confirmation is enabled and confirm the email first.
- **Invite fails:** ensure `supabase/schema.sql` completed successfully, invite links are less than seven days old, and the recipient is signed in.
- **Realtime does not update another browser:** enable Realtime replication for `public.trips` in Supabase. Normal refresh/save still works without Realtime.
- **Gemini error or quota warning:** verify the key in Google AI Studio and check the free-tier quota/model access. Do not paste API keys into source files or GitHub.
- **Vercel build fails while finding the Python app:** ensure the Vercel root directory contains `main.py`, `pyproject.toml` and `package.json`; do not set a nested root directory. Keep the project on the FastAPI framework preset so the build command in `pyproject.toml` runs.
