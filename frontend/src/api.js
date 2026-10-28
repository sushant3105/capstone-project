const STORE_KEY = "travel-itinerary-planner-trips";

function readStore() {
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY) || "{}") || {};
  } catch {
    return {};
  }
}

function writeStore(store) {
  localStorage.setItem(STORE_KEY, JSON.stringify(store));
}

function makeId() {
  return `trip-${crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36)}`;
}

function toDateList(startDate, endDate) {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const dates = [];
  for (let cursor = new Date(start); cursor <= end; cursor.setDate(cursor.getDate() + 1)) {
    dates.push(new Date(cursor));
  }
  return dates;
}

function createDay(dayNumber, date, preferences) {
  const interest = preferences.interests[0] || "local experiences";
  const cost = Math.max(30, Math.round((preferences.budget || 1000) / Math.max(3, preferences.group_size || 1) / 3));
  return {
    day_number: dayNumber,
    date: date.toISOString().slice(0, 10),
    summary: `A ${preferences.pacing || "balanced"} day built around ${interest} and scenic downtime in ${preferences.destination}.`,
    activities: [
      {
        title: `${interest[0].toUpperCase()}${interest.slice(1)} walk`,
        category: interest,
        start_time: "09:30",
        duration_minutes: 120,
        description: `Explore the most memorable ${interest} spots in ${preferences.destination} with flexible timing and local recommendations.`,
        estimated_cost: cost,
        location: preferences.destination,
        transportation: "Walk or local transit",
      },
      {
        title: "Dining highlight",
        category: "food",
        start_time: "13:00",
        duration_minutes: 90,
        description: "Enjoy a curated meal based on your budget and travel preferences, with a balance of comfort and authenticity.",
        estimated_cost: Math.round(cost * 0.8),
        location: preferences.destination,
        transportation: "Short taxi or walking route",
      },
    ],
    estimated_day_cost: cost * 1.8,
  };
}

function buildMockItinerary(payload) {
  const preferences = {
    ...payload,
    interests: Array.isArray(payload.interests) ? payload.interests : String(payload.interests || "food, sightseeing").split(",").map((item) => item.trim()).filter(Boolean),
    group_size: Number(payload.group_size || 1),
    budget: Number(payload.budget || 1000),
    destination: payload.destination || "Your destination",
    travel_style: payload.travel_style || "comfortable",
    pacing: payload.pacing || "balanced",
  };
  const dates = toDateList(preferences.start_date, preferences.end_date);
  const days = dates.map((date, index) => createDay(index + 1, date, preferences));
  const total = days.reduce((sum, day) => sum + day.estimated_day_cost, 0);
  return {
    title: `${preferences.destination} itinerary`,
    overview: `A ${preferences.travel_style} trip for ${preferences.group_size} traveler(s), designed around ${preferences.interests.join(", ")}.`,
    accommodation: "Recommended stay near the city center with easy access to your key stops.",
    days,
    total_estimated_cost: Number(total.toFixed(2)),
    cost_disclaimer: "AI-generated estimate; verify prices before booking.",
  };
}

function buildTripRecord(payload) {
  const preferences = {
    destination: payload.destination,
    start_date: payload.start_date,
    end_date: payload.end_date,
    budget: Number(payload.budget),
    interests: Array.isArray(payload.interests) ? payload.interests : [payload.interests],
    travel_style: payload.travel_style,
    group_size: Number(payload.group_size),
    pacing: payload.pacing,
  };
  const id = makeId();
  const item = {
    id,
    preferences,
    itinerary: buildMockItinerary(preferences),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  const store = readStore();
  store[id] = item;
  writeStore(store);
  return item;
}

export const createTrip = async (payload) => buildTripRecord(payload);

export const getTrip = async (id) => {
  const store = readStore();
  return store[id] || null;
};

export const updateItinerary = async (id, itinerary) => {
  const store = readStore();
  const current = store[id];
  if (!current) {
    throw new Error("Trip not found");
  }
  const updated = { ...current, itinerary, updated_at: new Date().toISOString() };
  store[id] = updated;
  writeStore(store);
  return updated;
};

export const regenerateTrip = async (id, day_number = null) => {
  const store = readStore();
  const current = store[id];
  if (!current) {
    throw new Error("Trip not found");
  }
  let itinerary = buildMockItinerary(current.preferences);
  if (day_number) {
    itinerary = { ...current.itinerary, days: current.itinerary.days.map((day) => (day.day_number === day_number ? {
      ...day,
      summary: `${day.summary} Updated on demand.`,
      activities: day.activities.map((activity, index) => ({
        ...activity,
        title: index === 0 ? `${activity.title} refreshed` : activity.title,
        estimated_cost: Math.round(activity.estimated_cost * 1.15),
      })),
      estimated_day_cost: Number((day.estimated_day_cost * 1.15).toFixed(2)),
    } : day)) };
  }
  const updated = { ...current, itinerary, updated_at: new Date().toISOString() };
  store[id] = updated;
  writeStore(store);
  return updated;
};
