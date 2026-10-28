const KEY = "travel-planner-trip-ids";

export function getTripIds() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "[]");
  } catch {
    return [];
  }
}

export function rememberTrip(id) {
  const ids = getTripIds().filter((item) => item !== id);
  localStorage.setItem(KEY, JSON.stringify([id, ...ids].slice(0, 20)));
}
