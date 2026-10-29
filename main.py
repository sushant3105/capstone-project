"""FastAPI API for Wayfarer. Designed for Vercel's Python runtime."""
from __future__ import annotations

import asyncio
import json
import os
import re
from datetime import date
from pathlib import Path
from typing import Any

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, Header, HTTPException
from fastapi.staticfiles import StaticFiles
from google import genai
from google.genai import types
from pydantic import BaseModel, Field, model_validator

BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")
DIST_DIR = BASE_DIR / "dist"
MODEL_NAME = os.getenv("GEMINI_MODEL", "gemini-3.5-flash-lite")

app = FastAPI(title="Wayfarer Travel Planner API", version="1.0.0")


class TripInput(BaseModel):
    destination: str = Field(min_length=2, max_length=120)
    start_date: date
    end_date: date
    budget: float = Field(ge=0, le=10_000_000)
    currency: str = Field(default="USD", min_length=3, max_length=3)
    interests: list[str] = Field(default_factory=list, max_length=10)
    travel_style: str = Field(default="balanced", max_length=40)
    group_size: int = Field(default=1, ge=1, le=30)
    pace: str = Field(default="balanced", max_length=30)
    notes: str = Field(default="", max_length=1000)

    @model_validator(mode="after")
    def dates_are_reasonable(self) -> "TripInput":
        day_count = (self.end_date - self.start_date).days + 1
        if day_count < 1:
            raise ValueError("The end date must be on or after the start date.")
        if day_count > 14:
            raise ValueError("For this free demo, trips can be up to 14 days long.")
        return self


class RegenerateDayInput(BaseModel):
    trip: TripInput
    day: dict[str, Any]
    day_index: int = Field(ge=0, le=13)


async def require_signed_in_user(authorization: str | None) -> dict[str, Any]:
    """Validate the caller's Supabase access token without storing it."""
    supabase_url = os.getenv("SUPABASE_URL")
    supabase_key = os.getenv("SUPABASE_ANON_KEY")
    if not supabase_url or not supabase_key:
        raise HTTPException(
            status_code=503,
            detail="Supabase is not configured on the backend. Add SUPABASE_URL and SUPABASE_ANON_KEY in Vercel settings.",
        )
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Please sign in before generating an itinerary.")

    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            response = await client.get(
                f"{supabase_url.rstrip('/')}/auth/v1/user",
                headers={"apikey": supabase_key, "Authorization": authorization},
            )
        if response.status_code != 200:
            raise HTTPException(status_code=401, detail="Your session has expired. Sign in again.")
        user_data = response.json()
        if not isinstance(user_data, dict) or not user_data.get("id"):
            raise HTTPException(status_code=401, detail="The sign-in session could not be verified.")
        return user_data
    except HTTPException:
        raise
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=503, detail="Could not reach Supabase to verify your session.") from exc


def _trip_brief(trip: TripInput) -> str:
    length = (trip.end_date - trip.start_date).days + 1
    return f"""
Destination: {trip.destination}
Dates: {trip.start_date.isoformat()} through {trip.end_date.isoformat()} inclusive ({length} days)
Total budget: {trip.budget:.2f} {trip.currency}
Travel style: {trip.travel_style}
Pace: {trip.pace}
Group size: {trip.group_size}
Interests: {', '.join(trip.interests) if trip.interests else 'a balanced mix of local highlights'}
Additional preferences: {trip.notes.strip() or 'none provided'}
""".strip()


def _extract_json(text: str) -> Any:
    cleaned = (text or "").strip()
    cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\s*```$", "", cleaned)
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        # Recover if a model accidentally adds a short preamble around JSON.
        start = cleaned.find("{")
        end = cleaned.rfind("}")
        if start >= 0 and end > start:
            return json.loads(cleaned[start : end + 1])
        raise


def _generate_json(api_key: str, prompt: str, max_tokens: int = 8192) -> Any:
    client = genai.Client(api_key=api_key)
    response = client.models.generate_content(
        model=MODEL_NAME,
        contents=prompt,
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
            temperature=0.65,
            max_output_tokens=max_tokens,
        ),
    )
    return _extract_json(response.text or "")


def _ai_error_message(exc: Exception) -> tuple[int, str]:
    message = str(exc).lower()
    if any(term in message for term in ("api key", "permission_denied", "unauthenticated", "invalid_argument")):
        return 400, "Gemini rejected this API key or request. Check the key in Google AI Studio and try again."
    if any(term in message for term in ("quota", "resource_exhausted", "rate limit", "429")):
        return 429, "Gemini's free-tier limit was reached. Wait for the quota to reset or check usage in Google AI Studio."
    if "timed out" in message or "timeout" in message:
        return 504, "Gemini took too long to respond. Try a shorter trip or try again."
    return 502, "Gemini could not generate this itinerary. Check your API key and model access, then try again."


@app.get("/api/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "service": "wayfarer-api"}


@app.post("/api/generate")
async def generate_itinerary(
    payload: TripInput,
    x_gemini_api_key: str = Header(default="", alias="x-gemini-api-key"),
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    await require_signed_in_user(authorization)
    api_key = x_gemini_api_key.strip()
    if len(api_key) < 15 or len(api_key) > 500:
        raise HTTPException(status_code=400, detail="Enter a valid Gemini API key in the key dialog.")

    prompt = f"""
You are a practical, thoughtful travel planner. Create a personalized itinerary using the trip brief below.

TRIP BRIEF
{_trip_brief(payload)}

Return one JSON object with exactly these useful top-level fields:
{{
  "trip_summary": "2-3 sentences tailored to this traveler",
  "days": [
    {{
      "date": "YYYY-MM-DD matching one trip date",
      "title": "short theme for this day",
      "summary": "a short overview",
      "activities": [
        {{
          "time": "09:00 AM",
          "title": "activity name",
          "category": "Sightseeing|Food|Nature|Culture|Adventure|Shopping|Rest|Transport",
          "description": "specific, useful detail in 1-2 sentences",
          "location": "place or neighborhood name",
          "travel_time": "approximate time to the next stop, or — for final stop",
          "estimated_cost": 0,
          "tips": "practical tip"
        }}
      ]
    }}
  ],
  "budget_breakdown": {{
    "accommodation": 0,
    "food": 0,
    "activities": 0,
    "transport": 0,
    "buffer": 0,
    "currency": "ISO currency code"
  }},
  "accommodation": {{
    "style": "suggested accommodation type or area",
    "notes": "how to choose a suitable stay; do not invent a booking",
    "estimated_nightly_cost": 0
  }},
  "transport_summary": "practical summary of local transport and route logic",
  "travel_tips": ["concise practical tips"]
}}

Requirements:
- Produce exactly one day per calendar date in the requested range, in chronological order.
- Plan 3-5 activities per day, with realistic breaks and sensible geographic clustering to reduce travel.
- Respect the budget, group size, travel style, pace, and interests. Use {payload.currency} for cost assumptions.
- Estimated costs are estimates for the whole group unless a note says otherwise. Keep totals broadly consistent with the budget.
- Do not claim opening hours, prices, transport schedules, availability, or reservations have been verified live. Say when a traveler should verify details.
- Prefer real, well-known places where you are reasonably confident. Never invent a booking confirmation.
- Keep descriptions concise, accessible, and helpful. Avoid generic filler.
- Respond with valid JSON only. No markdown fences and no additional prose.
""".strip()

    try:
        result = await asyncio.to_thread(_generate_json, api_key, prompt, 8192)
        if not isinstance(result, dict) or not isinstance(result.get("days"), list):
            raise ValueError("Unexpected itinerary format")
        expected_days = (payload.end_date - payload.start_date).days + 1
        if len(result["days"]) != expected_days:
            # Repair only the schedule length; never let a malformed AI result reach storage.
            raise ValueError("The response did not contain one itinerary day per trip date")
        result.setdefault("trip_summary", f"A personalized plan for {payload.destination}.")
        result.setdefault("budget_breakdown", {"currency": payload.currency})
        result.setdefault("accommodation", {})
        result.setdefault("transport_summary", "Confirm local transport options before traveling.")
        result.setdefault("travel_tips", [])
        return result
    except Exception as exc:
        status, detail = _ai_error_message(exc)
        raise HTTPException(status_code=status, detail=detail) from exc


@app.post("/api/regenerate-day")
async def regenerate_day(
    payload: RegenerateDayInput,
    x_gemini_api_key: str = Header(default="", alias="x-gemini-api-key"),
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    await require_signed_in_user(authorization)
    api_key = x_gemini_api_key.strip()
    if len(api_key) < 15 or len(api_key) > 500:
        raise HTTPException(status_code=400, detail="Enter a valid Gemini API key in the key dialog.")
    if payload.day_index >= (payload.trip.end_date - payload.trip.start_date).days + 1:
        raise HTTPException(status_code=400, detail="That itinerary day is outside the trip dates.")

    prompt = f"""
Regenerate exactly one travel itinerary day. Keep the same date and destination, improve geographic flow, and respect the traveler's budget and preferences.

TRIP BRIEF
{_trip_brief(payload.trip)}

CURRENT DAY TO REPLACE
{json.dumps(payload.day, ensure_ascii=False)}

Return one JSON object for the new day only, with this shape:
{{
  "date": "YYYY-MM-DD",
  "title": "short theme",
  "summary": "short overview",
  "activities": [
    {{"time":"09:00 AM","title":"activity name","category":"Sightseeing|Food|Nature|Culture|Adventure|Shopping|Rest|Transport","description":"specific details","location":"place name or area","travel_time":"approximate time to next stop","estimated_cost":0,"tips":"practical tip"}}
  ]
}}
Use 3-5 activities with realistic breaks. Avoid claiming that prices or opening hours were checked live. Costs are estimates for the whole group in {payload.trip.currency}. Return valid JSON only, without markdown.
""".strip()
    try:
        result = await asyncio.to_thread(_generate_json, api_key, prompt, 4096)
        if isinstance(result, dict) and isinstance(result.get("day"), dict):
            result = result["day"]
        if not isinstance(result, dict) or not isinstance(result.get("activities"), list):
            raise ValueError("Unexpected day format")
        result["date"] = payload.day.get("date", result.get("date", payload.trip.start_date.isoformat()))
        return result
    except Exception as exc:
        status, detail = _ai_error_message(exc)
        raise HTTPException(status_code=status, detail=detail) from exc


# Vercel's current FastAPI integration can promote files under this mount to its CDN.
# Declare API routes before the catch-all frontend mount so API requests always win.
if DIST_DIR.is_dir() and (DIST_DIR / "index.html").is_file():
    app.mount("/", StaticFiles(directory=str(DIST_DIR), html=True), name="frontend")
