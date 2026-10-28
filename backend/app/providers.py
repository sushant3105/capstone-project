import json
from datetime import date, timedelta
from typing import Protocol

import httpx

from .config import Settings
from .models import Activity, Itinerary, ItineraryDay, TripPreferences
from .prompts import build_itinerary_prompt


class ItineraryProvider(Protocol):
    async def generate(self, preferences: TripPreferences, day_number: int | None = None) -> Itinerary: ...


class GeminiHttpProvider:
    def __init__(self, settings: Settings):
        self.settings = settings

    async def generate(self, preferences: TripPreferences, day_number: int | None = None) -> Itinerary:
        if not self.settings.gemini_api_key:
            raise RuntimeError("GEMINI_API_KEY is required for the Gemini provider")
        url = f"{self.settings.gemini_base_url.rstrip('/')}/chat/completions"
        payload = {
            "model": self.settings.gemini_model,
            "messages": [{"role": "user", "content": build_itinerary_prompt(preferences, day_number)}],
            "temperature": 0.4,
            "response_format": {"type": "json_object"},
        }
        last_error = None
        async with httpx.AsyncClient(timeout=60) as client:
            for attempt in range(2):
                try:
                    response = await client.post(
                        url,
                        headers={"Authorization": f"Bearer {self.settings.gemini_api_key}"},
                        json=payload,
                    )
                    response.raise_for_status()
                    break
                except (httpx.TimeoutException, httpx.NetworkError, httpx.HTTPStatusError) as error:
                    last_error = error
                    if attempt == 1:
                        raise RuntimeError("Gemini itinerary generation failed after retry") from error
        if last_error and "response" not in locals():
            raise RuntimeError("Gemini itinerary generation failed") from last_error
        content = response.json()["choices"][0]["message"]["content"]
        return Itinerary.model_validate(json.loads(content))


class GeminiSdkProvider:
    """Adapter seam for the official Google GenAI SDK.

    The SDK is intentionally optional. Install/configure it and implement this
    adapter when the deployment uses Google's native client instead of HTTP.
    """

    def __init__(self, settings: Settings):
        self.settings = settings

    async def generate(self, preferences: TripPreferences, day_number: int | None = None) -> Itinerary:
        raise RuntimeError("Google GenAI SDK provider is not configured in this environment")


class MockProvider:
    async def generate(self, preferences: TripPreferences, day_number: int | None = None) -> Itinerary:
        days = (preferences.end_date - preferences.start_date).days + 1
        if day_number:
            days = 1
        output_days = []
        for offset in range(days):
            current_day = preferences.start_date + timedelta(days=offset if not day_number else day_number - 1)
            activity = Activity(
                title=f"{preferences.interests[0].title()} discovery",
                category=preferences.interests[0],
                start_time="10:00",
                duration_minutes=120,
                description=f"Explore a highly rated {preferences.interests[0]} experience in {preferences.destination}.",
                estimated_cost=round(preferences.budget / max(days, 1) / 3, 2),
                location=preferences.destination,
                transportation="Walk or use local transit",
            )
            output_days.append(
                ItineraryDay(
                    day_number=day_number or offset + 1,
                    date=current_day,
                    summary=f"A {preferences.pacing} day focused on {', '.join(preferences.interests[:3])}.",
                    activities=[activity],
                    estimated_day_cost=activity.estimated_cost,
                )
            )
        total = sum(day.estimated_day_cost for day in output_days)
        return Itinerary(
            title=f"{preferences.destination} itinerary",
            overview=f"A {days}-day {preferences.travel_style.lower()} trip for {preferences.group_size}.",
            accommodation="Choose a well-reviewed stay near the main activity area.",
            days=output_days,
            total_estimated_cost=total,
        )


def create_provider(settings: Settings) -> ItineraryProvider:
    if settings.ai_provider == "gemini_http":
        return GeminiHttpProvider(settings)
    if settings.ai_provider == "gemini_sdk":
        return GeminiSdkProvider(settings)
    return MockProvider()
