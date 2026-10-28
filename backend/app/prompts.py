import json

from .models import TripPreferences


def build_itinerary_prompt(preferences: TripPreferences, day_number: int | None = None) -> str:
    focus = f"Regenerate only day {day_number}." if day_number else "Generate the complete itinerary."
    schema = {
        "title": "string",
        "overview": "string",
        "accommodation": "string",
        "days": [
            {
                "day_number": 1,
                "date": "YYYY-MM-DD",
                "summary": "string",
                "activities": [
                    {
                        "title": "string",
                        "category": "string",
                        "start_time": "HH:MM",
                        "duration_minutes": 60,
                        "description": "string",
                        "estimated_cost": 0,
                        "location": "string",
                        "transportation": "string",
                    }
                ],
                "estimated_day_cost": 0,
            }
        ],
        "total_estimated_cost": 0,
        "cost_disclaimer": "AI-generated estimate; verify prices before booking.",
    }
    return (
        "You are a practical travel planner. Return JSON only, matching this schema exactly. "
        "Use realistic timing, nearby locations, and avoid impossible overlaps. "
        "All costs are estimates in the user's local currency and must be labeled as estimates.\n"
        f"Trip preferences: {preferences.model_dump_json()}\n"
        f"{focus}\n"
        f"Schema: {json.dumps(schema)}"
    )
