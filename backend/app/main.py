from contextlib import asynccontextmanager
from uuid import UUID

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware

from .config import get_settings
from .models import CreateTripRequest, RegenerateRequest, Trip, UpdateItineraryRequest
from .providers import create_provider
from .repository import InMemoryTripRepository, SupabaseTripRepository

settings = get_settings()
repository = (
    SupabaseTripRepository(settings.supabase_url, settings.supabase_key)
    if settings.supabase_url and settings.supabase_key
    else InMemoryTripRepository()
)
provider = create_provider(settings)


@asynccontextmanager
async def lifespan(_: FastAPI):
    yield


app = FastAPI(title="Personalized Travel Itinerary Planner", version="0.1.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_origin],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.post("/api/trips", response_model=Trip, status_code=201)
async def create_trip(request: CreateTripRequest):
    itinerary = await provider.generate(request)
    return await repository.create(request, itinerary)


@app.get("/api/trips/{trip_id}", response_model=Trip)
async def get_trip(trip_id: UUID):
    trip = await repository.get(trip_id)
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")
    return trip


@app.put("/api/trips/{trip_id}/itinerary", response_model=Trip)
async def update_itinerary(trip_id: UUID, request: UpdateItineraryRequest):
    trip = await repository.update(trip_id, request.itinerary)
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")
    return trip


@app.post("/api/trips/{trip_id}/regenerate", response_model=Trip)
async def regenerate(trip_id: UUID, request: RegenerateRequest):
    trip = await repository.get(trip_id)
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")
    itinerary = await provider.generate(trip.preferences, request.day_number)
    if request.day_number:
        days = [day for day in trip.itinerary.days if day.day_number != request.day_number]
        itinerary = trip.itinerary.model_copy(update={"days": sorted(days + itinerary.days, key=lambda day: day.day_number)})
    return await repository.update(trip_id, itinerary)
