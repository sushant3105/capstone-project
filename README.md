# Personalized Travel Itinerary Planner

Mock-only MVP for the SmartBridge project: a React/Vite frontend that generates, saves, edits, and regenerates travel itineraries fully in the browser with no backend API, Supabase, or external AI required.

## Local development

```powershell
cd frontend
npm install
Copy-Item .env.example .env
npm run dev
```

Open the Vite URL shown in the terminal, usually `http://localhost:5173`.

## Deployment on Vercel

This app is ready to deploy as a static site on Vercel with no API or database. The frontend stores generated trips in browser local storage and does all planning logic locally.

1. Push this repo to GitHub.
2. Import the repo in Vercel.
3. Set the framework to Vite.
4. Use the default build settings.
5. Deploy.

The included `vercel.json` is already configured for the static frontend build output.

## Notes

- No backend service, API key, or Supabase configuration is required for the mock deployment.
- The backend files still exist in the repo only as an optional reference; they are not required for the Vercel mock build.
