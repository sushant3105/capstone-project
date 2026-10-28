from datetime import date
from typing import Literal
from uuid import UUID, uuid4

from pydantic import BaseModel, Field, field_validator


class TripPreferences(BaseModel):
    destination: str = Field(min_length=2, max_length=120)
    start_date: date
    end_date: date
    budget: float = Field(gt=0, le=1_000_000)
    interests: list[str] = Field(min_length=1, max_length=12)
    travel_style: str = Field(min_length=2, max_length=60)
    group_size: int = Field(default=1, ge=1, le=50)
    pacing: Literal["relaxed", "balanced", "fast"] = "balanced"

    @field_validator("end_date")
    @classmethod
    def end_after_start(cls, value: date, info):
        start = info.data.get("start_date")
        if start and value < start:
            raise ValueError("end_date must be on or after start_date")
        return value


class Activity(BaseModel):
    title: str = Field(min_length=1, max_length=160)
    category: str = Field(min_length=1, max_length=60)
    start_time: str = Field(min_length=1, max_length=20)
    duration_minutes: int = Field(gt=0, le=1_440)
    description: str = Field(min_length=1, max_length=1_000)
    estimated_cost: float = Field(ge=0)
    location: str = Field(min_length=1, max_length=240)
    transportation: str = Field(min_length=1, max_length=240)


class ItineraryDay(BaseModel):
    day_number: int = Field(ge=1)
    date: date
    summary: str = Field(min_length=1, max_length=500)
    activities: list[Activity] = Field(min_length=1)
    estimated_day_cost: float = Field(ge=0)


class Itinerary(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    overview: str = Field(min_length=1, max_length=2_000)
    accommodation: str = Field(min_length=1, max_length=500)
    days: list[ItineraryDay] = Field(min_length=1)
    total_estimated_cost: float = Field(ge=0)
    cost_disclaimer: str = "AI-generated estimate; verify prices before booking."


class Trip(BaseModel):
    id: UUID = Field(default_factory=uuid4)
    preferences: TripPreferences
    itinerary: Itinerary
    created_at: str
    updated_at: str


class CreateTripRequest(TripPreferences):
    pass


class UpdateItineraryRequest(BaseModel):
    itinerary: Itinerary


class RegenerateRequest(BaseModel):
    day_number: int | None = Field(default=None, ge=1)
