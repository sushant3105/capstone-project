import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { createTrip, getTrip, regenerateTrip, updateItinerary } from "./api";
import { getTripIds, rememberTrip } from "./storage";
import "./styles.css";

const initialForm = {
  destination: "",
  start_date: "",
  end_date: "",
  budget: 1000,
  interests: "food, sightseeing",
  travel_style: "comfortable",
  group_size: 1,
  pacing: "balanced",
};

function App() {
  const [form, setForm] = useState(initialForm);
  const [trip, setTrip] = useState(null);
  const [savedTrips, setSavedTrips] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all(getTripIds().map((id) => getTrip(id).catch(() => null))).then((trips) =>
      setSavedTrips(trips.filter(Boolean)),
    );
  }, []);

  function change(event) {
    setForm({ ...form, [event.target.name]: event.target.value });
  }

  async function submit(event) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const created = await createTrip({
        ...form,
        budget: Number(form.budget),
        group_size: Number(form.group_size),
        interests: form.interests.split(",").map((item) => item.trim()).filter(Boolean),
      });
      rememberTrip(created.id);
      setTrip(created);
      setSavedTrips((items) => [created, ...items.filter((item) => item.id !== created.id)]);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }

  async function saveItinerary(itinerary) {
    if (!trip) return;
    try {
      const updated = await updateItinerary(trip.id, itinerary);
      setTrip(updated);
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  async function regenerate(dayNumber = null) {
    if (!trip) return;
    setLoading(true);
    setError("");
    try {
      const updated = await regenerateTrip(trip.id, dayNumber);
      setTrip(updated);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="shell">
      <header className="hero">
        <div>
          <span className="eyebrow">SMART TRIP PLANNER</span>
          <h1>Plan a trip worth remembering.</h1>
          <p>Turn your dates, budget, and travel style into a practical day-by-day itinerary.</p>
        </div>
        <button className="secondary" onClick={() => regenerate()} disabled={!trip || loading}>
          Regenerate itinerary
        </button>
      </header>

      <section className="grid">
        <form className="card builder" onSubmit={submit}>
          <div className="card-title"><h2>Build your trip</h2><span>01</span></div>
          <label>Destination<input name="destination" value={form.destination} onChange={change} placeholder="e.g. Kyoto, Japan" required /></label>
          <div className="two-col">
            <label>Start date<input type="date" name="start_date" value={form.start_date} onChange={change} required /></label>
            <label>End date<input type="date" name="end_date" value={form.end_date} onChange={change} required /></label>
          </div>
          <div className="two-col">
            <label>Budget<input type="number" min="1" name="budget" value={form.budget} onChange={change} required /></label>
            <label>Group size<input type="number" min="1" name="group_size" value={form.group_size} onChange={change} required /></label>
          </div>
          <label>Interests <small>comma separated</small><input name="interests" value={form.interests} onChange={change} /></label>
          <label>Travel style<select name="travel_style" value={form.travel_style} onChange={change}><option>comfortable</option><option>budget</option><option>luxury</option><option>adventure</option></select></label>
          <label>Pacing<select name="pacing" value={form.pacing} onChange={change}><option value="relaxed">Relaxed</option><option value="balanced">Balanced</option><option value="fast">Fast-paced</option></select></label>
          <button className="primary" disabled={loading}>{loading ? "Creating your plan..." : "Generate itinerary →"}</button>
          {error && <p className="error">{error}</p>}
        </form>

        <section className="card itinerary">
          {!trip ? (
            <div className="empty"><div className="empty-icon">✦</div><h2>Your itinerary will appear here</h2><p>Fill in your preferences and let the planner organize the details.</p></div>
          ) : (
            <>
              <div className="itinerary-head"><div><span className="eyebrow">YOUR PLAN</span><h2>{trip.itinerary.title}</h2><p>{trip.itinerary.overview}</p></div><strong>~${trip.itinerary.total_estimated_cost.toFixed(0)}</strong></div>
              <p className="accommodation">🏡 {trip.itinerary.accommodation}</p>
              {trip.itinerary.days.map((day) => <DayEditor key={day.day_number} day={day} onSave={(updated) => saveItinerary({ ...trip.itinerary, days: trip.itinerary.days.map((item) => item.day_number === day.day_number ? updated : item) })} onRegenerate={() => regenerate(day.day_number)} />)}
              <small className="disclaimer">{trip.itinerary.cost_disclaimer}</small>
            </>
          )}
        </section>
      </section>

      {savedTrips.length > 0 && <section className="saved"><span className="eyebrow">SAVED TRIPS</span><div className="saved-list">{savedTrips.map((item) => <button key={item.id} onClick={() => setTrip(item)}>{item.preferences.destination}<small>{item.preferences.start_date} · {item.itinerary.days.length} days</small></button>)}</div></section>}
    </main>
  );
}

function DayEditor({ day, onSave, onRegenerate }) {
  const [summary, setSummary] = useState(day.summary);
  const [editing, setEditing] = useState(false);
  return <article className="day">
    <div className="day-head"><div><span>DAY {day.day_number}</span><h3>{day.date}</h3></div><button className="text-button" onClick={onRegenerate}>Regenerate day</button></div>
    {editing ? <div className="edit-row"><input value={summary} onChange={(event) => setSummary(event.target.value)} /><button className="text-button" onClick={() => { onSave({ ...day, summary }); setEditing(false); }}>Save</button></div> : <p className="summary" onClick={() => setEditing(true)}>{summary} <small>edit</small></p>}
    {day.activities.map((activity) => <div className="activity" key={`${day.day_number}-${activity.title}`}><div className="time">{activity.start_time}<small>{activity.duration_minutes} min</small></div><div><h4>{activity.title}</h4><p>{activity.description}</p><small>{activity.location} · {activity.transportation}</small></div><strong>~${activity.estimated_cost.toFixed(0)}</strong></div>)}
  </article>;
}

createRoot(document.getElementById("root")).render(<App />);
