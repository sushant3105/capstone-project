import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDownRight, ArrowLeft, ArrowRight, ArrowUpRight, Backpack, CalendarDays,
  Check, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, CircleHelp,
  Clock3, Compass, Copy, CreditCard, Earth, Ellipsis, ExternalLink, Eye,
  EyeOff, FileText, Footprints, Gauge, Globe2, Heart, KeyRound, Leaf,
  LoaderCircle, LogOut, Map, MapPin, Menu, MessageCircle, Minus, Moon,
  Mountain, Pencil, Plus, RefreshCw, Route, Share2, ShieldCheck, Sparkles,
  Sun, Ticket, Trash2, Users, Utensils, Wallet, Waves, X,
} from 'lucide-react';
import { isSupabaseConfigured, supabase } from './supabase';

const INTERESTS = [
  'Food & dining', 'Nature', 'Museums & culture', 'Architecture',
  'Adventure', 'History', 'Shopping', 'Nightlife', 'Slow mornings',
];

const newTripForm = () => {
  const today = new Date();
  const start = new Date(today.getTime() + 7 * 86400000);
  const end = new Date(start.getTime() + 2 * 86400000);
  const iso = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  return {
    destination: '', start_date: iso(start), end_date: iso(end), budget: '25000',
    currency: 'INR', travel_style: 'balanced', group_size: '1', pace: 'balanced',
    interests: ['Food & dining', 'Sightseeing'], notes: '',
  };
};

const money = (value, currency = 'INR') => {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return '—';
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency', currency, maximumFractionDigits: amount >= 1000 ? 0 : 2,
    }).format(amount);
  } catch {
    return `${currency} ${Math.round(amount).toLocaleString()}`;
  }
};

const formatDate = (value, options = { month: 'short', day: 'numeric' }) => {
  if (!value) return '';
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, options);
};

const tripDays = (trip) => trip?.itinerary?.days || [];
const getDuration = (trip) => {
  if (!trip?.start_date || !trip?.end_date) return tripDays(trip).length || 1;
  return Math.max(1, Math.round((new Date(`${trip.end_date}T12:00:00`) - new Date(`${trip.start_date}T12:00:00`)) / 86400000) + 1);
};

function App() {
  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);
  const [booting, setBooting] = useState(true);
  const [authMode, setAuthMode] = useState('signin');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authBusy, setAuthBusy] = useState(false);
  const [authMessage, setAuthMessage] = useState('');
  const [authError, setAuthError] = useState('');
  const [trips, setTrips] = useState([]);
  const [activeTrip, setActiveTrip] = useState(null);
  const [activeNav, setActiveNav] = useState('overview');
  const [showBuilder, setShowBuilder] = useState(false);
  const [form, setForm] = useState(newTripForm);
  const [geminiKey, setGeminiKey] = useState(''); // Intentionally never persisted to browser storage.
  const [showKeyModal, setShowKeyModal] = useState(false);
  const [keyDraft, setKeyDraft] = useState('');
  const [keyVisible, setKeyVisible] = useState(false);
  const [pendingGenerate, setPendingGenerate] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteLink, setInviteLink] = useState('');
  const [inviteBusy, setInviteBusy] = useState(false);
  const [memberCount, setMemberCount] = useState(1);
  const [selectedDay, setSelectedDay] = useState(0);
  const [editingActivity, setEditingActivity] = useState(null);
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState(null);
  const [mobileNav, setMobileNav] = useState(false);
  const joinedCodeRef = useRef('');

  const notify = useCallback((message, kind = 'info') => {
    setNotice({ message, kind, id: Date.now() });
    window.setTimeout(() => setNotice((current) => current?.message === message ? null : current), 4200);
  }, []);

  useEffect(() => {
    if (!supabase) {
      setBooting(false);
      return undefined;
    }
    let alive = true;
    supabase.auth.getSession().then(({ data, error }) => {
      if (!alive) return;
      if (error) setAuthError(error.message);
      setSession(data?.session || null);
      setUser(data?.session?.user || null);
      setBooting(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((event, nextSession) => {
      // Never carry a session-only Gemini key across sign-out or account changes.
      if (event === 'SIGNED_OUT' || event === 'SIGNED_IN') {
        setGeminiKey('');
        setKeyDraft('');
      }
      setSession(nextSession);
      setUser(nextSession?.user || null);
    });
    return () => {
      alive = false;
      listener?.subscription?.unsubscribe();
    };
  }, []);

  const refreshTrips = useCallback(async (preserveActive = true) => {
    if (!supabase || !user) return;
    const { data, error } = await supabase
      .from('trips').select('*').order('updated_at', { ascending: false });
    if (error) {
      notify(error.message || 'Could not load your trips.', 'error');
      return;
    }
    setTrips(data || []);
    if (preserveActive && activeTrip) {
      const latest = (data || []).find((trip) => trip.id === activeTrip.id);
      if (latest) setActiveTrip(latest);
    }
  }, [user, activeTrip, notify]);

  useEffect(() => {
    if (user) refreshTrips(false);
    else {
      setTrips([]);
      setActiveTrip(null);
    }
  }, [user?.id]); // Refresh when the signed-in account changes.

  useEffect(() => {
    if (!user || !supabase) return undefined;
    const code = new URLSearchParams(window.location.search).get('join');
    if (!code || joinedCodeRef.current === code) return undefined;
    joinedCodeRef.current = code;
    let cancelled = false;
    (async () => {
      const { data: tripId, error } = await supabase.rpc('join_trip_by_code', { p_code: code });
      window.history.replaceState({}, '', window.location.pathname);
      if (cancelled) return;
      if (error) {
        notify(`Could not join this trip: ${error.message}`, 'error');
        return;
      }
      const { data: trip, error: tripError } = await supabase.from('trips').select('*').eq('id', tripId).single();
      if (tripError) {
        notify('Trip joined, but it could not be opened. Refresh the trip list.', 'error');
        await refreshTrips(false);
        return;
      }
      await refreshTrips(false);
      setActiveTrip(trip);
      setActiveNav('trips');
      setSelectedDay(0);
      notify(`Joined the trip to ${trip.destination}.` , 'success');
    })();
    return () => { cancelled = true; };
  }, [user?.id, notify, refreshTrips]);

  useEffect(() => {
    if (!activeTrip || !user || !supabase) return undefined;
    supabase.from('trip_members').select('user_id', { count: 'exact', head: true })
      .eq('trip_id', activeTrip.id)
      .then(({ count }) => setMemberCount(count || 1));
    const channel = supabase.channel(`trip-updates-${activeTrip.id}`)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'trips', filter: `id=eq.${activeTrip.id}`,
      }, (payload) => {
        const nextTrip = payload.new;
        setActiveTrip((current) => current?.id === nextTrip.id ? nextTrip : current);
        setTrips((current) => current.map((trip) => trip.id === nextTrip.id ? nextTrip : trip));
      }).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [activeTrip?.id, user?.id]);

  const apiRequest = useCallback(async (path, body, apiKey = geminiKey) => {
    if (!session?.access_token) throw new Error('Your session expired. Sign in again.');
    const response = await fetch(path, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
        'x-gemini-api-key': apiKey,
      },
      body: JSON.stringify(body),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.detail || 'The request failed. Try again.');
    return result;
  }, [session?.access_token, geminiKey]);

  const buildPayload = (input) => ({
    destination: input.destination.trim(), start_date: input.start_date, end_date: input.end_date,
    budget: Number(input.budget), currency: input.currency, interests: input.interests,
    travel_style: input.travel_style, group_size: Number(input.group_size), pace: input.pace,
    notes: input.notes.trim(),
  });

  const generateTrip = async (input, apiKey = geminiKey) => {
    setBusy('generate');
    try {
      const itinerary = await apiRequest('/api/generate', buildPayload(input), apiKey);
      const { data: trip, error } = await supabase.from('trips').insert({
        owner_id: user.id,
        title: `${input.destination.trim()} getaway`,
        destination: input.destination.trim(),
        start_date: input.start_date,
        end_date: input.end_date,
        budget: Number(input.budget),
        currency: input.currency,
        travel_style: input.travel_style,
        interests: input.interests,
        group_size: Number(input.group_size),
        itinerary,
      }).select('*').single();
      if (error) throw error;
      setTrips((current) => [trip, ...current.filter((item) => item.id !== trip.id)]);
      setActiveTrip(trip);
      setActiveNav('trips');
      setSelectedDay(0);
      setShowBuilder(false);
      setForm(newTripForm());
      notify('Your itinerary is ready. Make it yours.', 'success');
    } catch (error) {
      notify(error.message || 'Could not generate the itinerary.', 'error');
    } finally {
      setBusy('');
    }
  };

  const handleBuilderSubmit = (event) => {
    event.preventDefault();
    if (!form.destination.trim()) {
      notify('Add a destination first.', 'error');
      return;
    }
    if (new Date(form.end_date) < new Date(form.start_date)) {
      notify('The return date must be on or after the departure date.', 'error');
      return;
    }
    if (!Number.isFinite(Number(form.budget)) || Number(form.budget) < 0) {
      notify('Enter a valid budget.', 'error');
      return;
    }
    const days = Math.round((new Date(`${form.end_date}T12:00:00`) - new Date(`${form.start_date}T12:00:00`)) / 86400000) + 1;
    if (days > 14) {
      notify('Keep trips to 14 days or fewer for this free demo.', 'error');
      return;
    }
    if (!geminiKey) {
      setPendingGenerate(true);
      setShowKeyModal(true);
      return;
    }
    generateTrip(form);
  };

  const saveTripPatch = async (patch, successMessage = 'Changes saved.') => {
    if (!activeTrip || !supabase) return false;
    setBusy('save');
    const { data, error } = await supabase.from('trips')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', activeTrip.id).select('*').single();
    setBusy('');
    if (error) {
      notify(error.message || 'Could not save changes.', 'error');
      return false;
    }
    setActiveTrip(data);
    setTrips((current) => current.map((trip) => trip.id === data.id ? data : trip));
    notify(successMessage, 'success');
    return true;
  };

  const regenerateDay = async (index) => {
    if (!activeTrip) return;
    if (!geminiKey) {
      setPendingGenerate(false);
      setShowKeyModal(true);
      notify('Add your Gemini API key to regenerate a day.', 'info');
      return;
    }
    const day = tripDays(activeTrip)[index];
    if (!day) return;
    setBusy(`day-${index}`);
    try {
      const regenerated = await apiRequest('/api/regenerate-day', {
        trip: {
          destination: activeTrip.destination,
          start_date: activeTrip.start_date,
          end_date: activeTrip.end_date,
          budget: Number(activeTrip.budget || 0), currency: activeTrip.currency || 'INR',
          interests: activeTrip.interests || [], travel_style: activeTrip.travel_style || 'balanced',
          group_size: Number(activeTrip.group_size || 1), pace: 'balanced', notes: '',
        },
        day,
        day_index: index,
      });
      const itinerary = { ...activeTrip.itinerary, days: [...tripDays(activeTrip)] };
      itinerary.days[index] = regenerated;
      await saveTripPatch({ itinerary }, `Day ${index + 1} regenerated.`);
    } catch (error) {
      notify(error.message || 'Could not regenerate this day.', 'error');
    } finally {
      setBusy('');
    }
  };

  const saveActivityEdit = async () => {
    if (!editingActivity || !activeTrip) return;
    const itinerary = { ...activeTrip.itinerary, days: [...tripDays(activeTrip)] };
    const day = { ...itinerary.days[editingActivity.dayIndex] };
    day.activities = [...(day.activities || [])];
    day.activities[editingActivity.activityIndex] = {
      ...day.activities[editingActivity.activityIndex],
      title: editingActivity.title.trim() || 'Activity',
      description: editingActivity.description.trim(),
    };
    itinerary.days[editingActivity.dayIndex] = day;
    const saved = await saveTripPatch({ itinerary }, 'Activity updated.');
    if (saved) setEditingActivity(null);
  };

  const shareTrip = async () => {
    if (!activeTrip || !supabase) return;
    setInviteBusy(true);
    const { data, error } = await supabase.rpc('create_trip_invite', { p_trip_id: activeTrip.id });
    setInviteBusy(false);
    if (error) {
      notify(error.message || 'Could not create an invite link.', 'error');
      return;
    }
    setInviteLink(`${window.location.origin}/?join=${encodeURIComponent(data)}`);
    setShowInviteModal(true);
  };

  const copyInvite = async () => {
    try {
      await navigator.clipboard.writeText(inviteLink);
      notify('Invite link copied.', 'success');
    } catch {
      notify('Copy the invite link from the field.', 'info');
    }
  };

  const handleAuth = async (event) => {
    event.preventDefault();
    if (!supabase) return;
    setAuthBusy(true); setAuthError(''); setAuthMessage('');
    try {
      if (authMode === 'signup') {
        const { data, error } = await supabase.auth.signUp({ email: authEmail.trim(), password: authPassword });
        if (error) throw error;
        if (!data.session) setAuthMessage('Account created. Check your email to confirm the account, then sign in.');
        else setAuthMessage('Account created. Your workspace is ready.');
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: authEmail.trim(), password: authPassword });
        if (error) throw error;
      }
    } catch (error) {
      setAuthError(error.message || 'Authentication failed.');
    } finally {
      setAuthBusy(false);
    }
  };

  const signOut = async () => {
    setGeminiKey(''); setKeyDraft(''); setActiveTrip(null);
    await supabase.auth.signOut();
  };

  const openTrip = (trip) => {
    setActiveTrip(trip); setActiveNav('trips'); setSelectedDay(0); setEditingActivity(null);
    setShowBuilder(false);
  };

  const visibleTrips = useMemo(() => {
    if (activeNav === 'shared') return trips.filter((trip) => trip.owner_id !== user?.id);
    return trips;
  }, [trips, activeNav, user?.id]);

  if (booting) return <LoadingScreen />;
  if (!isSupabaseConfigured) return <ConfigurationScreen />;
  if (!user) {
    return <AuthScreen
      mode={authMode} setMode={setAuthMode} email={authEmail} setEmail={setAuthEmail}
      password={authPassword} setPassword={setAuthPassword} busy={authBusy}
      error={authError} message={authMessage} onSubmit={handleAuth}
    />;
  }

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileNav ? 'sidebar-open' : ''}`}>
        <div className="brand-lockup"><span className="brand-mark"><Compass size={22} strokeWidth={2.1} /></span><span>wayfarer<span className="brand-dot">.</span></span></div>
        <div className="workspace-label">WORKSPACE</div>
        <nav className="main-nav" aria-label="Main navigation">
          <button className={activeNav === 'overview' ? 'nav-item active' : 'nav-item'} onClick={() => { setActiveNav('overview'); setActiveTrip(null); setShowBuilder(false); setMobileNav(false); }}><span className="nav-icon"><Gauge size={18} /></span> Overview</button>
          <button className={activeNav === 'trips' ? 'nav-item active' : 'nav-item'} onClick={() => { setActiveNav('trips'); setActiveTrip(null); setShowBuilder(false); setMobileNav(false); }}><span className="nav-icon"><Map size={18} /></span> My trips <span className="nav-count">{trips.filter((trip) => trip.owner_id === user.id).length}</span></button>
          <button className={activeNav === 'shared' ? 'nav-item active' : 'nav-item'} onClick={() => { setActiveNav('shared'); setActiveTrip(null); setShowBuilder(false); setMobileNav(false); }}><span className="nav-icon"><Users size={18} /></span> Shared with me <span className="nav-count">{trips.filter((trip) => trip.owner_id !== user.id).length}</span></button>
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-tip"><div className="tip-icon"><Sparkles size={17} /></div><strong>Your next story awaits.</strong><p>A good trip starts with a little curiosity.</p><button onClick={() => { setShowBuilder(true); setActiveTrip(null); setMobileNav(false); }}>Plan a trip <ArrowUpRight size={14} /></button></div>
          <div className="profile-row"><div className="avatar">{(user.email || 'T').charAt(0).toUpperCase()}</div><div className="profile-copy"><strong>{user.email?.split('@')[0] || 'Traveler'}</strong><span>Free workspace</span></div><button className="icon-button signout-button" aria-label="Sign out" title="Sign out" onClick={signOut}><LogOut size={16} /></button></div>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <button className="icon-button mobile-menu" aria-label="Open menu" onClick={() => setMobileNav(!mobileNav)}><Menu size={19} /></button>
          <div className="breadcrumbs"><span>Workspace</span><ChevronRight size={14} /><strong>{activeTrip ? activeTrip.destination : showBuilder ? 'Trip builder' : activeNav === 'shared' ? 'Shared with me' : activeNav === 'trips' ? 'My trips' : 'Overview'}</strong></div>
          <div className="topbar-actions"><span className="free-pill"><span className="status-dot"></span> Free plan</span><button className="avatar top-avatar" title={user.email}>{(user.email || 'T').charAt(0).toUpperCase()}</button></div>
        </header>

        <div className="page-body">
          {activeTrip ? (
            <TripDetail
              trip={activeTrip} user={user} memberCount={memberCount} selectedDay={selectedDay}
              setSelectedDay={setSelectedDay} busy={busy} geminiKey={geminiKey}
              onBack={() => { setActiveTrip(null); setActiveNav('trips'); }}
              onShare={shareTrip} onRegenerate={regenerateDay} onEditActivity={setEditingActivity}
              onSetKey={() => { setPendingGenerate(false); setShowKeyModal(true); }}
              onRename={(title) => saveTripPatch({ title }, 'Trip title updated.')}
            />
          ) : showBuilder ? (
            <TripBuilder form={form} setForm={setForm} onSubmit={handleBuilderSubmit} busy={busy === 'generate'} onCancel={() => setShowBuilder(false)} hasKey={Boolean(geminiKey)} onSetKey={() => { setPendingGenerate(false); setShowKeyModal(true); }} />
          ) : (
            <Overview
              user={user} trips={visibleTrips} allTrips={trips} nav={activeNav} onNavigate={setActiveNav}
              onNewTrip={() => { setForm(newTripForm()); setShowBuilder(true); setActiveTrip(null); }} onOpenTrip={openTrip}
              onSetupKey={() => { setPendingGenerate(false); setShowKeyModal(true); }} hasKey={Boolean(geminiKey)}
            />
          )}
        </div>
        <footer className="app-footer"><span>Made for the moments between the map pins.</span><span><ShieldCheck size={13} /> Your keys stay in this session</span></footer>
      </main>

      {showKeyModal && <Modal title="Connect Gemini" subtitle="Use your own free-tier Google AI Studio key." onClose={() => { setShowKeyModal(false); setPendingGenerate(false); setKeyDraft(''); }}>
        <div className="key-explainer"><div className="key-icon"><KeyRound size={20} /></div><div><strong>Your key, your control</strong><p>Wayfarer sends your key only with your AI request. It is held in page memory and disappears when you refresh or sign out.</p></div></div>
        <label className="field-label" htmlFor="gemini-key">Gemini API key</label>
        <div className="input-with-action"><input id="gemini-key" type={keyVisible ? 'text' : 'password'} autoComplete="off" value={keyDraft} onChange={(event) => setKeyDraft(event.target.value)} placeholder={geminiKey ? 'A key is set for this session' : 'Paste your key here'} /><button type="button" className="input-action" onClick={() => setKeyVisible(!keyVisible)} aria-label={keyVisible ? 'Hide key' : 'Show key'}>{keyVisible ? <EyeOff size={17} /> : <Eye size={17} />}</button></div>
        <p className="field-hint">Create a key at <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">Google AI Studio <ExternalLink size={12} /></a>. Choose a model available on the free tier.</p>
        <div className="modal-actions split-actions"><button className="button button-quiet" onClick={() => { setGeminiKey(''); setKeyDraft(''); }}>Forget session key</button><button className="button button-primary" disabled={keyDraft.trim().length < 15} onClick={() => { const chosen = keyDraft.trim(); setGeminiKey(chosen); setKeyDraft(''); setShowKeyModal(false); setKeyVisible(false); const shouldGenerate = pendingGenerate; setPendingGenerate(false); notify('Gemini key set for this session.', 'success'); if (shouldGenerate) generateTrip(form, chosen); }}>Save key{pendingGenerate ? ' & generate' : ''} <ArrowRight size={16} /></button></div>
      </Modal>}

      {showInviteModal && <Modal title="Invite your travel crew" subtitle="Anyone with this link can join as an editor while signed in." onClose={() => setShowInviteModal(false)}>
        <div className="invite-note"><Users size={18} /><span>Invite links expire after 7 days. Share them only with people who should be able to edit this trip.</span></div>
        <label className="field-label" htmlFor="invite-link">Trip invite link</label>
        <div className="input-with-action"><input id="invite-link" readOnly value={inviteLink} onFocus={(event) => event.target.select()} /><button type="button" className="input-action" onClick={copyInvite} aria-label="Copy invite link"><Copy size={17} /></button></div>
        <div className="modal-actions"><button className="button button-primary full-button" onClick={copyInvite}><Copy size={16} /> Copy invite link</button></div>
      </Modal>}

      {editingActivity && <Modal title="Edit activity" subtitle="Small adjustments make the plan feel like yours." onClose={() => setEditingActivity(null)}>
        <label className="field-label" htmlFor="activity-title">Activity title</label><input id="activity-title" className="text-input" value={editingActivity.title} onChange={(event) => setEditingActivity({ ...editingActivity, title: event.target.value })} />
        <label className="field-label spaced-label" htmlFor="activity-description">Description</label><textarea id="activity-description" className="text-area" rows={4} value={editingActivity.description} onChange={(event) => setEditingActivity({ ...editingActivity, description: event.target.value })} />
        <div className="modal-actions"><button className="button button-quiet" onClick={() => setEditingActivity(null)}>Cancel</button><button className="button button-primary" disabled={busy === 'save'} onClick={saveActivityEdit}>{busy === 'save' ? <LoaderCircle className="spin" size={16} /> : <Check size={16} />} Save changes</button></div>
      </Modal>}

      {notice && <div className={`toast toast-${notice.kind}`} role="status"><span className="toast-symbol">{notice.kind === 'error' ? <CircleHelp size={17} /> : <CheckCircle2 size={17} />}</span>{notice.message}<button className="toast-close" onClick={() => setNotice(null)} aria-label="Dismiss notification"><X size={15} /></button></div>}
    </div>
  );
}

function LoadingScreen() {
  return <div className="center-screen"><div className="loading-logo"><Compass size={26} /></div><LoaderCircle className="spin" size={22} /><p>Getting your workspace ready…</p></div>;
}

function ConfigurationScreen() {
  return <div className="setup-screen"><div className="setup-card"><div className="brand-lockup setup-brand"><span className="brand-mark"><Compass size={22} /></span><span>wayfarer<span className="brand-dot">.</span></span></div><div className="eyebrow">ONE-TIME SETUP</div><h1>Almost ready to take off.</h1><p className="setup-intro">Add your Supabase project URL and publishable key to connect authentication and trip storage. No paid services are needed for the basic setup.</p><ol className="setup-steps"><li><span>1</span><div><strong>Create a free Supabase project</strong><p>Open <a href="https://supabase.com/dashboard" target="_blank" rel="noreferrer">Supabase Dashboard <ExternalLink size={12} /></a>, create a project, and copy its project URL and publishable/anon key.</p></div></li><li><span>2</span><div><strong>Add the frontend environment variables</strong><p>In Vercel Project → Settings → Environment Variables, set <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code>.</p></div></li><li><span>3</span><div><strong>Add the same values for FastAPI</strong><p>Set <code>SUPABASE_URL</code> and <code>SUPABASE_ANON_KEY</code> to the same values, then redeploy.</p></div></li></ol><div className="setup-foot"><ShieldCheck size={16} /> Never add a Supabase service-role key here. The app uses Row Level Security.</div></div></div>;
}

function AuthScreen({ mode, setMode, email, setEmail, password, setPassword, busy, error, message, onSubmit }) {
  return <div className="auth-screen"><div className="auth-visual"><div className="auth-visual-art art-sun"></div><div className="auth-visual-art art-hill-one"></div><div className="auth-visual-art art-hill-two"></div><div className="auth-visual-copy"><div className="auth-kicker"><Sparkles size={14} /> PLANS FOR THE WAY YOU TRAVEL</div><h1>The world is wide.<br /><em>Your plans can be simple.</em></h1><p>Thoughtful itineraries, personal to you. Less scrolling, more stories worth telling.</p><div className="auth-quote"><span>“</span><div><strong>Go somewhere that makes you feel small.</strong><small>And come back with a bigger story.</small></div></div><div className="auth-art-caption"><MapPin size={13} /> Somewhere worth the journey</div></div></div><div className="auth-panel"><div className="brand-lockup"><span className="brand-mark"><Compass size={22} /></span><span>wayfarer<span className="brand-dot">.</span></span></div><div className="auth-form-wrap"><div className="eyebrow">YOUR TRAVEL WORKSPACE</div><h2>{mode === 'signin' ? 'Welcome back.' : 'Let’s get you going.'}</h2><p className="auth-subtitle">{mode === 'signin' ? 'Sign in to pick up where your next adventure left off.' : 'Create your free account and start shaping a trip.'}</p>
      <form onSubmit={onSubmit} className="auth-form"><label className="field-label" htmlFor="auth-email">Email address</label><input id="auth-email" className="text-input" type="email" required autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" /><label className="field-label spaced-label" htmlFor="auth-password">Password</label><input id="auth-password" className="text-input" type="password" required minLength={6} autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="At least 6 characters" />
      {error && <div className="inline-alert alert-error">{error}</div>}{message && <div className="inline-alert alert-success">{message}</div>}
      <button className="button button-primary auth-submit" disabled={busy}>{busy ? <LoaderCircle className="spin" size={17} /> : null}{mode === 'signin' ? 'Sign in' : 'Create account'} <ArrowRight size={17} /></button></form>
      <div className="auth-switch">{mode === 'signin' ? 'New around here?' : 'Already have an account?'} <button onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); }} type="button">{mode === 'signin' ? 'Create an account' : 'Sign in'}</button></div><div className="auth-privacy"><ShieldCheck size={15} /> Your trips are private unless you share an invite link.</div></div><div className="auth-panel-footer">Built for curious people, not complicated planning.</div></div></div>;
}

function Overview({ user, trips, allTrips, nav, onNavigate, onNewTrip, onOpenTrip, onSetupKey, hasKey }) {
  const owned = allTrips.filter((trip) => trip.owner_id === user.id);
  const nextTrip = [...allTrips].filter((trip) => trip.start_date >= new Date().toISOString().slice(0, 10)).sort((a, b) => a.start_date.localeCompare(b.start_date))[0];
  const firstName = user.email?.split('@')[0]?.replace(/[._-]/g, ' ') || 'traveler';
  const titleName = firstName.charAt(0).toUpperCase() + firstName.slice(1);
  return <>
    <div className="welcome-row"><div><div className="eyebrow"><Sun size={13} /> A LITTLE ROOM FOR ADVENTURE</div><h1>{nav === 'shared' ? 'Good trips are better shared.' : nav === 'trips' ? 'Your trip collection.' : `Good to see you, ${titleName}.`}</h1><p>{nav === 'shared' ? 'Trips your friends have invited you to shape.' : nav === 'trips' ? 'Every plan, one place. Your next favorite memory is in here somewhere.' : 'The planning part, minus the thirteen open tabs.'}</p></div><button className="button button-primary new-trip-button" onClick={onNewTrip}><Plus size={17} /> Plan a trip</button></div>
    {nav === 'overview' && <section className="hero-panel"><div className="hero-copy"><span className="hero-chip"><Sparkles size={13} /> YOUR NEXT CHAPTER</span><h2>Collect moments,<br /><em>not browser tabs.</em></h2><p>Tell us what you love, what you want to spend, and when you’re going. We’ll shape it into a day-by-day plan worth looking forward to.</p><button className="button button-light" onClick={onNewTrip}>Build my itinerary <ArrowRight size={16} /></button><div className="hero-footnote"><span><CheckCircle2 size={13} /> Personalized plans</span><span><CheckCircle2 size={13} /> Shared editing</span><span><CheckCircle2 size={13} /> Free to start</span></div></div><div className="hero-art"><div className="art-orbit orbit-one"></div><div className="art-orbit orbit-two"></div><div className="art-sun-disc"></div><div className="art-mountain mountain-back"></div><div className="art-mountain mountain-front"></div><div className="art-river"></div><div className="art-route"><span className="route-point point-one"></span><span className="route-point point-two"></span><span className="route-point point-three"></span><span className="route-path"></span></div><div className="art-postcard"><div className="postcard-icon"><MapPin size={14} /></div><span>FIND YOUR SOMEWHERE</span><strong>Take the scenic route.</strong></div><div className="floating-stamp stamp-top"><Waves size={17} /><span>Go slow<br />sometimes</span></div><div className="floating-stamp stamp-bottom"><Leaf size={17} /><span>Leave room<br />for a detour</span></div></div></section>}
    {nav === 'overview' && <section className="stats-grid"><StatCard icon={<Map size={18} />} label="TRIPS PLANNED" value={allTrips.length} hint="Your adventures, collected" tint="lavender" /><StatCard icon={<Users size={18} />} label="SHARED TRIPS" value={allTrips.filter((trip) => trip.owner_id !== user.id).length} hint="Plans made together" tint="peach" /><StatCard icon={<CalendarDays size={18} />} label="NEXT DEPARTURE" value={nextTrip ? formatDate(nextTrip.start_date, { month: 'short', day: 'numeric' }) : 'Not yet'} hint={nextTrip ? nextTrip.destination : 'A good time to dream'} tint="mint" /></section>}
    {nav === 'overview' && <div className="section-heading"><div><span className="eyebrow">YOUR TRAVEL JOURNAL</span><h3>Recent trips</h3></div><button className="text-button" onClick={() => onNavigate('trips')}>View all <ArrowRight size={15} /></button></div>}
    {(nav !== 'overview' || trips.length > 0) && <section className={`trip-grid ${nav !== 'overview' ? 'trip-grid-large' : ''}`}>
      {trips.slice(0, nav === 'overview' ? 3 : undefined).map((trip, index) => <TripCard key={trip.id} trip={trip} index={index} shared={trip.owner_id !== user.id} onClick={() => onOpenTrip(trip)} />)}
      {trips.length === 0 && <div className="empty-state"><div className="empty-illustration"><Compass size={34} /><span></span></div><h3>{nav === 'shared' ? 'No shared trips yet.' : 'A blank page. A thousand possibilities.'}</h3><p>{nav === 'shared' ? 'When someone invites you to plan a trip, it will show up here.' : 'Create your first itinerary and give your next getaway a head start.'}</p>{nav !== 'shared' && <button className="button button-primary" onClick={onNewTrip}><Plus size={16} /> Plan your first trip</button>}</div>}
    </section>}
    {nav === 'overview' && <div className="bottom-panels"><section className="note-panel"><div className="note-panel-icon"><KeyRound size={18} /></div><div><strong>{hasKey ? 'Gemini is connected for this session' : 'Bring your own Gemini key'}</strong><p>{hasKey ? 'Your key is held in memory only. Refreshing or signing out clears it.' : 'Use a free-tier Google AI Studio key to generate and regenerate itineraries.'}</p></div><button className="button button-quiet small-button" onClick={onSetupKey}>{hasKey ? 'Change key' : 'Connect key'}</button></section><section className="mini-tip-panel"><div className="mini-tip-icon"><Heart size={18} /></div><div><span className="eyebrow">A REMINDER</span><strong>Leave a little unplanned.</strong><p>The best story rarely sticks to the schedule.</p></div><ArrowDownRight size={22} className="mini-tip-arrow" /></section></div>}
    {nav === 'overview' && <p className="tiny-disclaimer"><ShieldCheck size={13} /> Estimates are for planning only. Confirm opening hours, local transport and prices before you go.</p>}
  </>;
}

function StatCard({ icon, label, value, hint, tint }) {
  return <div className="stat-card"><div className={`stat-icon ${tint}`}>{icon}</div><div className="stat-label">{label}</div><div className="stat-value">{value}</div><div className="stat-hint">{hint}</div></div>;
}

function TripCard({ trip, index, shared, onClick }) {
  const days = getDuration(trip);
  const accent = ['trip-art-sage', 'trip-art-coral', 'trip-art-blue', 'trip-art-amber'][index % 4];
  const icon = [<Mountain size={40} />, <Waves size={40} />, <Sun size={40} />, <Leaf size={40} />][index % 4];
  return <button className="trip-card" onClick={onClick}>
    <div className={`trip-card-art ${accent}`}><div className="trip-art-glow"></div><div className="trip-art-shape shape-a"></div><div className="trip-art-shape shape-b"></div><div className="trip-art-shape shape-c"></div><div className="trip-art-icon">{icon}</div><span className="trip-art-label">{shared ? 'SHARED JOURNEY' : 'YOUR ITINERARY'}</span></div>
    <div className="trip-card-copy"><div className="trip-card-top"><span className="trip-dates"><CalendarDays size={13} /> {formatDate(trip.start_date)} {trip.end_date ? `– ${formatDate(trip.end_date)}` : ''}</span><span className={`trip-state ${shared ? 'state-shared' : ''}`}>{shared ? <Users size={12} /> : <CheckCircle2 size={12} />}{shared ? 'Shared' : 'Planned'}</span></div><h4>{trip.title || `${trip.destination} getaway`}</h4><div className="trip-card-destination"><MapPin size={14} /> {trip.destination}</div><div className="trip-card-footer"><span><CalendarDays size={14} /> {days} {days === 1 ? 'day' : 'days'}</span><span><Wallet size={14} /> {money(trip.budget, trip.currency)}</span><span className="card-arrow"><ArrowUpRight size={16} /></span></div></div>
  </button>;
}

function TripBuilder({ form, setForm, onSubmit, busy, onCancel, hasKey, onSetKey }) {
  const update = (field, value) => setForm((current) => ({ ...current, [field]: value }));
  const toggleInterest = (value) => update('interests', form.interests.includes(value) ? form.interests.filter((interest) => interest !== value) : [...form.interests, value]);
  return <div className="builder-page"><button className="back-link" onClick={onCancel}><ArrowLeft size={15} /> Back to overview</button><div className="builder-heading"><div><span className="eyebrow"><Sparkles size={13} /> YOUR TRIP, YOUR RULES</span><h1>Start with a feeling.</h1><p>Give us a few details. We’ll take care of turning them into a thoughtful plan.</p></div><div className="builder-badge"><Compass size={27} /><span>THE SMART<br />TRIP BUILDER</span></div></div>
    <form className="builder-layout" onSubmit={onSubmit}><div className="builder-main"><section className="form-section"><div className="form-section-header"><div className="section-number">01</div><div><h3>Where are we going?</h3><p>Pick a destination and give the trip its dates.</p></div></div><div className="field"><label className="field-label" htmlFor="destination">Destination</label><div className="field-icon-input"><MapPin size={17} /><input id="destination" type="text" required value={form.destination} onChange={(event) => update('destination', event.target.value)} placeholder="e.g. Kyoto, Japan" maxLength={120} /></div></div><div className="two-fields"><div className="field"><label className="field-label" htmlFor="start-date">Leaving</label><div className="field-icon-input"><CalendarDays size={16} /><input id="start-date" type="date" required value={form.start_date} onChange={(event) => update('start_date', event.target.value)} /></div></div><div className="field"><label className="field-label" htmlFor="end-date">Coming back</label><div className="field-icon-input"><CalendarDays size={16} /><input id="end-date" type="date" min={form.start_date} required value={form.end_date} onChange={(event) => update('end_date', event.target.value)} /></div></div></div></section>
      <section className="form-section"><div className="form-section-header"><div className="section-number">02</div><div><h3>What's your travel style?</h3><p>Comfortable shoes or boutique hotels? Both are valid.</p></div></div><div className="choice-grid style-grid">{[{value:'budget',label:'Budget minded',icon:<Wallet size={19} />,desc:'Spend thoughtfully'},{value:'balanced',label:'A little of both',icon:<Compass size={19} />,desc:'Comfort + value'},{value:'comfort',label:'Comfort first',icon:<Heart size={19} />,desc:'Take it easy'},{value:'luxury',label:'Treat yourself',icon:<Sparkles size={19} />,desc:'Special stays'}].map((option) => <button type="button" key={option.value} className={`choice-card ${form.travel_style === option.value ? 'selected' : ''}`} onClick={() => update('travel_style', option.value)}><span className="choice-icon">{option.icon}</span><span className="choice-text"><strong>{option.label}</strong><small>{option.desc}</small></span>{form.travel_style === option.value && <span className="choice-check"><Check size={13} /></span>}</button>)}</div><div className="field field-top"><label className="field-label">Pace of the trip</label><div className="pace-control">{[{value:'relaxed',label:'Slow & easy',icon:<Leaf size={16} />},{value:'balanced',label:'Balanced',icon:<Footprints size={16} />},{value:'packed',label:'See it all',icon:<Gauge size={16} />}].map((option) => <button type="button" key={option.value} className={form.pace === option.value ? 'pace-option active' : 'pace-option'} onClick={() => update('pace', option.value)}>{option.icon}{option.label}</button>)}</div></div></section>
      <section className="form-section"><div className="form-section-header"><div className="section-number">03</div><div><h3>What do you love?</h3><p>Choose the things you want more of. You can pick a few.</p></div></div><div className="interest-cloud">{INTERESTS.map((interest) => <button key={interest} type="button" className={`interest-chip ${form.interests.includes(interest) ? 'selected' : ''}`} onClick={() => toggleInterest(interest)}>{form.interests.includes(interest) && <Check size={13} />}{interest}</button>)}</div><div className="field field-top"><label className="field-label" htmlFor="trip-notes">Any must-haves? <span className="optional-label">OPTIONAL</span></label><textarea id="trip-notes" className="text-area" rows={3} maxLength={1000} value={form.notes} onChange={(event) => update('notes', event.target.value)} placeholder="A quiet café, easy walking routes, vegetarian food, a special anniversary…" /></div></section></div>
      <aside className="builder-aside"><div className="budget-card"><div className="budget-card-head"><span className="budget-icon"><CreditCard size={18} /></span><div><h3>Set your budget</h3><p>Make every bit count.</p></div></div><label className="field-label" htmlFor="trip-budget">Total trip budget</label><div className="budget-input-row"><span className="currency-prefix">{form.currency}</span><input id="trip-budget" type="number" min="0" step="100" required value={form.budget} onChange={(event) => update('budget', event.target.value)} /></div><div className="currency-options">{['INR','USD','EUR','GBP'].map((currency) => <button type="button" key={currency} className={form.currency === currency ? 'active' : ''} onClick={() => update('currency', currency)}>{currency}</button>)}</div><div className="budget-divider"></div><label className="field-label" htmlFor="group-size">Travelers</label><div className="select-wrap"><Users size={16} /><select id="group-size" value={form.group_size} onChange={(event) => update('group_size', event.target.value)}>{Array.from({length:12}, (_, index) => index + 1).map((count) => <option key={count} value={count}>{count} {count === 1 ? 'traveler' : 'travelers'}</option>)}</select><ChevronDown size={15} /></div><div className="budget-summary"><span>Trip length</span><strong>{Math.max(1, Math.round((new Date(`${form.end_date}T12:00:00`) - new Date(`${form.start_date}T12:00:00`)) / 86400000) + 1)} days</strong></div><div className="budget-summary"><span>Budget per traveler</span><strong>{money(Number(form.budget || 0) / Math.max(1, Number(form.group_size)), form.currency)}</strong></div></div><div className="builder-ai-card"><div className="ai-sparkle"><Sparkles size={19} /></div><strong>Made for your kind of trip.</strong><p>Gemini will shape a day-by-day itinerary with activities, food, local transport and budget estimates.</p><div className="ai-status"><span className={`status-dot ${hasKey ? '' : 'status-dot-muted'}`}></span>{hasKey ? 'Gemini key ready for this session' : 'Your own Gemini API key required'}</div>{!hasKey && <button type="button" className="text-button" onClick={onSetKey}>Connect your key <ArrowRight size={14} /></button>}</div><button className="button button-primary generate-button" type="submit" disabled={busy}>{busy ? <><LoaderCircle size={17} className="spin" /> Building your itinerary…</> : <><Sparkles size={17} /> Generate my itinerary <ArrowRight size={17} /></>}</button><p className="builder-fineprint"><ShieldCheck size={13} /> Free-tier APIs only. You keep control of your key.</p></aside></form></div>;
}

function TripDetail({ trip, user, memberCount, selectedDay, setSelectedDay, busy, geminiKey, onBack, onShare, onRegenerate, onEditActivity, onSetKey, onRename }) {
  const days = tripDays(trip);
  const day = days[Math.min(selectedDay, Math.max(0, days.length - 1))];
  const [titleDraft, setTitleDraft] = useState(trip.title || `${trip.destination} getaway`);
  const [renameOpen, setRenameOpen] = useState(false);
  useEffect(() => setTitleDraft(trip.title || `${trip.destination} getaway`), [trip.id, trip.title]);
  const allActivities = days.flatMap((item) => item.activities || []);
  const estimatedCost = allActivities.reduce((total, activity) => total + (Number(activity.estimated_cost) || 0), 0);
  const breakdown = trip.itinerary?.budget_breakdown || {};
  const breakdownTotal = ['accommodation','food','activities','transport','buffer'].reduce((total, key) => total + (Number(breakdown[key]) || 0), 0);
  const displayBudget = trip.budget || breakdownTotal;
  const remaining = Math.max(0, Number(displayBudget) - (breakdownTotal || estimatedCost));
  const setActivityEdit = (activityIndex, activity) => onEditActivity({ dayIndex: selectedDay, activityIndex, title: activity.title || '', description: activity.description || '' });
  return <div className="trip-detail-page"><button className="back-link" onClick={onBack}><ArrowLeft size={15} /> All trips</button><div className="detail-hero"><div className="detail-hero-art"><div className="detail-art-sun"></div><div className="detail-art-mountain detail-mountain-a"></div><div className="detail-art-mountain detail-mountain-b"></div><div className="detail-art-route"></div><span className="detail-art-tag"><MapPin size={12} /> {trip.destination}</span></div><div className="detail-hero-info"><div className="detail-topline"><span className="eyebrow">YOUR PERSONAL ITINERARY</span><span className="live-pill"><span className="status-dot"></span> Saved to cloud</span></div><div className="detail-title-row">{renameOpen ? <form className="rename-form" onSubmit={(event) => { event.preventDefault(); onRename(titleDraft); setRenameOpen(false); }}><input aria-label="Trip title" value={titleDraft} onChange={(event) => setTitleDraft(event.target.value)} autoFocus /><button className="icon-button" type="submit" aria-label="Save title"><Check size={16} /></button></form> : <h1>{trip.title || `${trip.destination} getaway`}</h1>}<button className="icon-button rename-button" aria-label="Rename trip" title="Rename trip" onClick={() => setRenameOpen(!renameOpen)}><Pencil size={15} /></button></div><div className="detail-meta"><span><CalendarDays size={15} /> {formatDate(trip.start_date, { month: 'long', day: 'numeric' })} – {formatDate(trip.end_date, { month: 'long', day: 'numeric', year: 'numeric' })}</span><span><Clock3 size={15} /> {getDuration(trip)} days</span><span><Users size={15} /> {trip.group_size || 1} {Number(trip.group_size) === 1 ? 'traveler' : 'travelers'}</span></div><p className="detail-summary">{trip.itinerary?.trip_summary || `A plan for seeing ${trip.destination} at your own pace.`}</p><div className="detail-actions"><button className="button button-primary" onClick={onShare}><Share2 size={16} /> Invite people <span className="member-count-pill">{memberCount}</span></button><button className="button button-outline" onClick={onSetKey}><KeyRound size={15} /> {geminiKey ? 'Gemini connected' : 'Connect Gemini'}</button></div></div></div>
    <div className="detail-columns"><div className="itinerary-column"><div className="section-heading detail-section-heading"><div><span className="eyebrow">THE PLAN</span><h3>Your itinerary</h3></div><span className="day-count">{days.length} {days.length === 1 ? 'day' : 'days'}</span></div>
      {days.length > 0 ? <><div className="day-tabs">{days.map((item, index) => <button key={`${item.date}-${index}`} className={index === selectedDay ? 'day-tab active' : 'day-tab'} onClick={() => setSelectedDay(index)}><span>DAY {index + 1}</span><strong>{formatDate(item.date, { month: 'short', day: 'numeric' })}</strong><small>{item.title || `Day ${index + 1}`}</small></button>)}</div><div className="day-heading-row"><div><span className="day-date-eyebrow">{day?.date ? formatDate(day.date, { weekday: 'long', month: 'long', day: 'numeric' }) : `Day ${selectedDay + 1}`}</span><h2>{day?.title || `Day ${selectedDay + 1}`}</h2><p>{day?.summary || 'A carefully paced day, ready for your own discoveries.'}</p></div><button className="icon-button regenerate-icon" title="Regenerate this day" aria-label="Regenerate this day" onClick={() => onRegenerate(selectedDay)} disabled={busy === `day-${selectedDay}`}><RefreshCw size={16} className={busy === `day-${selectedDay}` ? 'spin' : ''} /></button></div>
      <div className="timeline">{(day?.activities || []).map((activity, index) => <ActivityCard key={`${activity.title}-${index}`} activity={activity} index={index} onEdit={() => setActivityEdit(index, activity)} currency={trip.currency || 'INR'} />)}</div><div className="day-bottom-actions"><button className="button button-outline" onClick={() => onRegenerate(selectedDay)} disabled={busy === `day-${selectedDay}`}><RefreshCw size={15} className={busy === `day-${selectedDay}` ? 'spin' : ''} /> {busy === `day-${selectedDay}` ? 'Reworking this day…' : 'Try a different day'}</button><span><Users size={14} /> Shared changes sync automatically</span></div></> : <div className="empty-day"><Compass size={28} /><h3>No itinerary days found</h3><p>This trip record has no generated days. Create a new trip to generate an itinerary.</p></div>}
      <div className="travel-tips-panel"><div className="tip-panel-icon"><Sparkles size={18} /></div><div><span className="eyebrow">A FEW USEFUL NOTES</span><ul>{(trip.itinerary?.travel_tips || ['Check local opening times before setting out.', 'Keep a little flexibility for spontaneous stops.']).slice(0, 4).map((tip, index) => <li key={index}>{tip}</li>)}</ul></div></div>
    </div>
    <aside className="trip-aside"><section className="aside-card budget-breakdown-card"><div className="aside-card-heading"><div className="aside-heading-icon"><Wallet size={18} /></div><div><h3>Budget snapshot</h3><p>Your estimated trip costs</p></div></div><div className="budget-total"><strong>{money(displayBudget, trip.currency || 'INR')}</strong><span>planned budget</span></div><div className="budget-progress-track"><div className="budget-progress-fill" style={{ width: `${Math.min(100, Math.max(8, ((breakdownTotal || estimatedCost) / Math.max(1, Number(displayBudget))) * 100))}%` }}></div></div><div className="budget-progress-label"><span>Estimated allocation</span><strong>{money(breakdownTotal || estimatedCost, trip.currency || 'INR')}</strong></div><div className="breakdown-list">{[{key:'accommodation',label:'Accommodation',icon:<Earth size={15}/>},{key:'food',label:'Food & dining',icon:<Utensils size={15}/>},{key:'activities',label:'Activities',icon:<Ticket size={15}/>},{key:'transport',label:'Transport',icon:<Route size={15}/>},{key:'buffer',label:'Flex budget',icon:<Sparkles size={15}/>}].map((item) => <div className="breakdown-row" key={item.key}><span className="breakdown-label">{item.icon}{item.label}</span><strong>{money(breakdown[item.key] || 0, trip.currency || 'INR')}</strong></div>)}</div><div className="budget-remaining"><span>Headroom in budget</span><strong>{money(remaining, trip.currency || 'INR')}</strong></div></section>
      <section className="aside-card stay-card"><div className="aside-card-heading"><div className="aside-heading-icon stay-heading-icon"><Moon size={18} /></div><div><h3>Where to stay</h3><p>A starting point, not a booking</p></div></div><h4>{trip.itinerary?.accommodation?.style || 'Stay near the main neighborhoods'}</h4><p>{trip.itinerary?.accommodation?.notes || 'Choose a convenient base near the places you most want to explore. Check reviews and transit access before booking.'}</p>{trip.itinerary?.accommodation?.estimated_nightly_cost != null && <div className="nightly-estimate"><span>Estimated / night</span><strong>{money(trip.itinerary.accommodation.estimated_nightly_cost, trip.currency || 'INR')}</strong></div>}</section>
      <section className="aside-card transport-card"><div className="aside-card-heading"><div className="aside-heading-icon transport-heading-icon"><Route size={18} /></div><div><h3>Getting around</h3><p>Keep the journey moving</p></div></div><p>{trip.itinerary?.transport_summary || 'Activities are grouped to reduce unnecessary travel. Confirm real-time routes and fares locally.'}</p></section>
      <div className="detail-disclaimer"><ShieldCheck size={15} /><p>AI-generated estimates are not live bookings or verified opening hours. Double-check details before paying or setting out.</p></div>
    </aside></div>
  </div>;
}

function ActivityCard({ activity, index, onEdit, currency }) {
  const iconFor = (category) => {
    const item = String(category || '').toLowerCase();
    if (item.includes('food')) return <Utensils size={17} />;
    if (item.includes('nature')) return <Leaf size={17} />;
    if (item.includes('transport')) return <Route size={17} />;
    if (item.includes('adventure')) return <Mountain size={17} />;
    if (item.includes('culture') || item.includes('history') || item.includes('museum')) return <Earth size={17} />;
    if (item.includes('rest')) return <CoffeeIcon />;
    return <MapPin size={17} />;
  };
  const mapsLink = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${activity.location || activity.title || ''}`)}`;
  return <article className="activity-row"><div className="timeline-rail"><span className="timeline-dot"></span><span className="timeline-line"></span></div><div className="activity-time">{activity.time || 'Flexible'}</div><div className="activity-main"><div className="activity-heading"><span className="activity-category-icon">{iconFor(activity.category)}</span><div><h3>{activity.title || `Stop ${index + 1}`}</h3><span className="activity-category">{activity.category || 'Explore'} {activity.location ? <><span className="category-separator">·</span><MapPin size={12} /> {activity.location}</> : null}</span></div><button className="icon-button activity-edit" onClick={onEdit} title="Edit activity" aria-label={`Edit ${activity.title || 'activity'}`}><Pencil size={14} /></button></div><p className="activity-description">{activity.description}</p>{activity.tips && <div className="activity-tip"><Sparkles size={13} /><span>{activity.tips}</span></div>}<div className="activity-footer">{activity.estimated_cost != null && <span className="activity-cost"><Wallet size={13} /> {money(activity.estimated_cost, currency)}</span>}{activity.travel_time && activity.travel_time !== '—' && <span><Route size={13} /> {activity.travel_time} onward</span>}<a href={mapsLink} target="_blank" rel="noreferrer" className="activity-map-link">Open map <ExternalLink size={12} /></a></div></div></article>;
}

function CoffeeIcon() {
  return <Sun size={17} />;
}

function Modal({ title, subtitle, onClose, children }) {
  useEffect(() => {
    const onKey = (event) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="modal-card" role="dialog" aria-modal="true" aria-label={title}><button className="modal-close icon-button" aria-label="Close dialog" onClick={onClose}><X size={18} /></button><div className="modal-eyebrow"><Sparkles size={13} /> WAYFARER</div><h2>{title}</h2><p className="modal-subtitle">{subtitle}</p><div className="modal-content">{children}</div></section></div>;
}

export default App;
