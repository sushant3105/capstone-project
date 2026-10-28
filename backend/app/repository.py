from datetime import datetime, timezone
from typing import Protocol
from uuid import UUID

from .models import Trip, TripPreferences


class TripRepository(Protocol):
    async def create(self, preferences: TripPreferences, itinerary) -> Trip: ...
    async def get(self, trip_id: UUID) -> Trip | None: ...
    async def update(self, trip_id: UUID, itinerary) -> Trip | None: ...


class InMemoryTripRepository:
    def __init__(self):
        self.items: dict[UUID, Trip] = {}

    async def create(self, preferences: TripPreferences, itinerary) -> Trip:
        now = datetime.now(timezone.utc).isoformat()
        trip = Trip(preferences=preferences, itinerary=itinerary, created_at=now, updated_at=now)
        self.items[trip.id] = trip
        return trip

    async def get(self, trip_id: UUID) -> Trip | None:
        return self.items.get(trip_id)

    async def update(self, trip_id: UUID, itinerary) -> Trip | None:
        trip = self.items.get(trip_id)
        if not trip:
            return None
        updated = trip.model_copy(update={"itinerary": itinerary, "updated_at": datetime.now(timezone.utc).isoformat()})
        self.items[trip_id] = updated
        return updated


class SupabaseTripRepository(InMemoryTripRepository):
    def __init__(self, url: str, key: str):
        from supabase import create_client

        self.client = create_client(url, key)

    async def create(self, preferences: TripPreferences, itinerary) -> Trip:
        trip = await super().create(preferences, itinerary)
        response = self.client.table("trips").insert(trip.model_dump(mode="json")).execute()
        if not response.data:
            raise RuntimeError("Supabase did not return the created trip")
        return Trip.model_validate(response.data[0])

    async def get(self, trip_id: UUID) -> Trip | None:
        response = self.client.table("trips").select("*").eq("id", str(trip_id)).maybe_single().execute()
        return Trip.model_validate(response.data) if response.data else None

    async def update(self, trip_id: UUID, itinerary) -> Trip | None:
        response = (
            self.client.table("trips")
            .update({
                "itinerary": itinerary.model_dump(mode="json"),
                "updated_at": datetime.now(timezone.utc).isoformat(),
            })
            .eq("id", str(trip_id))
            .select("*")
            .maybe_single()
            .execute()
        )
        return Trip.model_validate(response.data) if response.data else None
