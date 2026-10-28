from fastapi.testclient import TestClient

from app.main import app


client = TestClient(app)


def payload():
    return {
        "destination": "Kyoto",
        "start_date": "2026-04-01",
        "end_date": "2026-04-03",
        "budget": 500,
        "interests": ["food", "culture"],
        "travel_style": "comfortable",
        "group_size": 1,
        "pacing": "balanced",
    }


def test_create_and_get_trip():
    response = client.post("/api/trips", json=payload())
    assert response.status_code == 201
    trip_id = response.json()["id"]
    fetched = client.get(f"/api/trips/{trip_id}")
    assert fetched.status_code == 200
    assert fetched.json()["preferences"]["destination"] == "Kyoto"


def test_rejects_invalid_date_range():
    data = payload()
    data["end_date"] = "2026-03-01"
    assert client.post("/api/trips", json=data).status_code == 422


def test_update_and_regenerate_day():
    created = client.post("/api/trips", json=payload()).json()
    trip_id = created["id"]
    itinerary = created["itinerary"]
    itinerary["overview"] = "Updated overview"
    updated = client.put(f"/api/trips/{trip_id}/itinerary", json={"itinerary": itinerary})
    assert updated.status_code == 200
    assert updated.json()["itinerary"]["overview"] == "Updated overview"

    regenerated = client.post(f"/api/trips/{trip_id}/regenerate", json={"day_number": 2})
    assert regenerated.status_code == 200
    assert len(regenerated.json()["itinerary"]["days"]) == 3
