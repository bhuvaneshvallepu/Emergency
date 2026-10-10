import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { BrowserRouter, NavLink, Route, Routes } from 'react-router-dom';
import axios from 'axios';
import { io } from 'socket.io-client';
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  Clock3,
  HeartPulse,
  Home,
  MapPinned,
  Navigation,
  Send,
  Shield,
  Siren,
  UserRound,
  Users,
} from 'lucide-react';
import { useGeolocation } from './hooks/useGeolocation.js';
import { describeAlertStatus } from './utils/alertStatus.js';
import 'leaflet/dist/leaflet.css';

const ServiceMap = lazy(() => import('./components/ServiceMap.jsx'));
const API = axios.create({ baseURL: '/api/v1' });
const defaultToken = 'demo-token';
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || window.location.origin;

function getAuthHeader() {
  const token = localStorage.getItem('safesphere-token') || defaultToken;
  return { Authorization: `Bearer ${token}` };
}

async function fetchJson(url, options = {}) {
  const response = await API.get(url, { headers: getAuthHeader(), ...options });
  return response.data;
}

function HomePage() {
  const location = useGeolocation();
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('other');
  const [incident, setIncident] = useState(null);
  const [services, setServices] = useState([]);
  const [serviceStatus, setServiceStatus] = useState('Loading nearby services...');
  const [sosNotifications, setSosNotifications] = useState([]);
  const [alertRefreshMessage, setAlertRefreshMessage] = useState('');
  const [sosStatus, setSosStatus] = useState('');
  const [sosState, setSosState] = useState('idle');
  const sosIdempotencyKey = useRef(crypto.randomUUID());

  useEffect(() => {
    const controller = new AbortController();
    const loadServices = async () => {
      try {
        const result = await fetchJson(
          `/services/nearby?lat=${location.latitude}&lng=${location.longitude}&category=hospital`,
          { signal: controller.signal },
        );
        setServices(result.facilities || []);
        setServiceStatus(result.label || 'Nearby service results');
      } catch {
        if (!controller.signal.aborted) {
          setServices([]);
          setServiceStatus('Nearby service lookup is unavailable right now.');
        }
      }
    };

    loadServices();
    return () => controller.abort();
  }, [location.latitude, location.longitude]);

  useEffect(() => {
    if (!incident?.id) return undefined;
    let active = true;
    const controller = new AbortController();
    const terminalStatuses = new Set(['delivered', 'undelivered', 'failed', 'disabled', 'configuration_error', 'skipped']);
    let refreshTimer;
    const refreshAlerts = async () => {
      try {
        const data = await fetchJson(`/incidents/${incident.id}/alerts`, { signal: controller.signal });
        if (!active) return;
        const alerts = data.alerts || [];
        setSosNotifications(alerts);
        setAlertRefreshMessage('');
        if (alerts.length && alerts.every((alert) => terminalStatuses.has(alert.status))) {
          window.clearInterval(refreshTimer);
        }
      } catch {
        if (active && !controller.signal.aborted) {
          setAlertRefreshMessage('The latest contact notification status could not be refreshed. Check Incident status for updates.');
        }
      }
    };
    void refreshAlerts();
    refreshTimer = window.setInterval(refreshAlerts, 15000);
    return () => {
      active = false;
      controller.abort();
      window.clearInterval(refreshTimer);
    };
  }, [incident?.id]);

  const sendSos = async () => {
    if (sosState === 'sending') return;
    setSosState('sending');
    setAlertRefreshMessage('');
    setSosStatus('Creating your incident. Waiting for server confirmation…');
    try {
      const payload = {
        description: description.trim() || 'User requested emergency assistance.',
        category,
        ...(location.permission === 'granted' || location.manualLocationEntered
          ? { latitude: location.latitude, longitude: location.longitude }
          : {}),
        source: 'manual_sos',
      };

      const response = await API.post('/incidents', payload, {
        headers: { ...getAuthHeader(), 'X-Idempotency-Key': sosIdempotencyKey.current },
      });
      setIncident(response.data.incident);
      setSosNotifications(response.data.notifications || []);
      sosIdempotencyKey.current = crypto.randomUUID();
      setSosState('created');
      setSosStatus('Incident creation was confirmed by the server. Notification delivery is not confirmed unless its status says delivered.');
    } catch {
      setSosState('error');
      setSosStatus('The server could not confirm this SOS. Check your connection and review incident status before retrying.');
    }
  };

  const quickCategories = ['medical', 'personal_safety', 'accident', 'fire', 'natural_disaster', 'other'];
  const locationLabel = location.permission === 'granted'
    ? 'Current device location'
    : location.permission === 'reading'
      ? 'Checking location permission…'
      : location.manualLocationEntered
        ? 'Manually entered location — not GPS verified'
        : location.permission === 'denied'
          ? 'Location permission denied — KPHB demo reference active'
          : location.permission === 'unsupported'
            ? 'GPS unavailable — KPHB demo reference active'
            : 'KPHB demo reference — not your verified location';

  return (
    <div className="space-y-5 sm:space-y-7">
      <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">Safety home</p>
        <h1 className="mt-1 text-2xl font-bold text-slate-950 sm:text-3xl">Emergency assistance</h1>

        <div className="mt-4 flex items-start gap-3 rounded-2xl bg-slate-50 p-3 text-sm">
          <MapPinned aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-sky-700" />
          <div className="min-w-0">
            <p className="font-semibold text-slate-900">{locationLabel}</p>
            <p className="mt-1 break-words text-slate-600">
              {Number(location.latitude).toFixed(4)}, {Number(location.longitude).toFixed(4)}
            </p>
            {location.permission !== 'granted' ? (
              <>
                <p className="mt-1 text-xs text-amber-900">
                  {location.manualLocationEntered
                    ? 'Manual coordinates will be included with SOS; they are not GPS verified.'
                    : 'KPHB coordinates are demo references, not your verified location. SOS will omit location until you enter coordinates or GPS is available.'}
                </p>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <label className="text-xs font-medium text-slate-700">
                    Latitude
                    <input
                      type="number"
                      inputMode="decimal"
                      min="-90"
                      max="90"
                      step="any"
                      aria-label="Manual latitude"
                      value={location.latitude}
                      onChange={(event) => {
                        const latitude = Number(event.target.value);
                        if (event.target.value !== '' && Number.isFinite(latitude) && latitude >= -90 && latitude <= 90) {
                          location.setManualLocation((previous) => ({ ...previous, latitude }));
                        }
                      }}
                      className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-base text-slate-900"
                    />
                  </label>
                  <label className="text-xs font-medium text-slate-700">
                    Longitude
                    <input
                      type="number"
                      inputMode="decimal"
                      min="-180"
                      max="180"
                      step="any"
                      aria-label="Manual longitude"
                      value={location.longitude}
                      onChange={(event) => {
                        const longitude = Number(event.target.value);
                        if (event.target.value !== '' && Number.isFinite(longitude) && longitude >= -180 && longitude <= 180) {
                          location.setManualLocation((previous) => ({ ...previous, longitude }));
                        }
                      }}
                      className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-base text-slate-900"
                    />
                  </label>
                </div>
              </>
            ) : null}
          </div>
        </div>

        <button
          type="button"
          onClick={sendSos}
          disabled={sosState === 'sending'}
          aria-describedby="sos-explanation"
          className="mt-4 flex min-h-16 w-full items-center justify-center gap-3 rounded-2xl bg-red-700 px-6 py-4 text-xl font-bold text-white shadow-lg shadow-red-100 transition hover:bg-red-800 disabled:cursor-wait disabled:opacity-70"
        >
          <Siren aria-hidden="true" className="h-6 w-6" />
          {sosState === 'sending' ? 'Sending SOS…' : sosState === 'created' ? 'SOS created — send another' : 'SOS — Get emergency help'}
        </button>
        <p id="sos-explanation" className="mt-2 text-center text-sm text-slate-600">
          Starts an incident immediately. GPS or manually entered coordinates are included only when available.
        </p>
        {sosStatus ? (
          <div role={sosState === 'error' ? 'alert' : 'status'} aria-live="polite" className={`mt-3 rounded-xl p-3 text-sm ${sosState === 'error' ? 'bg-amber-50 text-amber-900' : sosState === 'created' ? 'bg-emerald-50 text-emerald-900' : 'bg-sky-50 text-sky-900'}`}>
            {sosStatus}
            {incident ? <span className="mt-1 block font-semibold">Incident {incident.id} · {incident.category}</span> : null}
            {sosNotifications.length ? (
              <ul className="mt-2 space-y-1">
                {sosNotifications.map((notification) => {
                  const status = describeAlertStatus(notification.status);
                  return (
                    <li key={notification.id}>
                      Contact alert: {status.label} — {notification.failureReason || status.description}
                    </li>
                  );
                })}
              </ul>
            ) : null}
            {alertRefreshMessage ? <span className="mt-2 block">{alertRefreshMessage}</span> : null}
          </div>
        ) : null}

        <div className="mt-5">
          <p className="mb-2 text-sm font-semibold text-slate-800">Emergency category</p>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {quickCategories.map((item) => (
              <button
                type="button"
                key={item}
                aria-pressed={category === item}
                onClick={() => setCategory(item)}
                className={`min-h-11 shrink-0 rounded-full border px-4 text-sm font-medium capitalize ${category === item ? 'border-sky-700 bg-sky-50 text-sky-800' : 'border-slate-300 bg-white text-slate-700'}`}
              >
                {item === 'other' ? 'General emergency' : item.replaceAll('_', ' ')}
              </button>
            ))}
          </div>
        </div>

        <label htmlFor="emergency-description" className="mb-2 mt-5 block text-sm font-semibold text-slate-800">Describe your emergency (optional)</label>
        <textarea
          id="emergency-description"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          rows="3"
          className="w-full rounded-2xl border border-slate-300 bg-slate-50 p-3 text-base text-slate-900 outline-none focus:border-sky-600"
          placeholder="Describe what is happening"
        />
      </section>

      <div className="grid gap-4 sm:grid-cols-2">
        <NavLink to="/copilot" className="flex min-h-24 items-center gap-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm hover:border-sky-300">
          <Bot aria-hidden="true" className="h-7 w-7 shrink-0 text-sky-700" />
          <span><strong className="block text-slate-900">AI Copilot</strong><span className="mt-1 block text-sm text-slate-600">Get calm, advisory next steps</span></span>
        </NavLink>
        <NavLink to="/journey" className="flex min-h-24 items-center gap-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm hover:border-sky-300">
          <Navigation aria-hidden="true" className="h-7 w-7 shrink-0 text-sky-700" />
          <span><strong className="block text-slate-900">Safety journey</strong><span className="mt-1 block text-sm text-slate-600">Set a destination and check-in</span></span>
        </NavLink>
      </div>

      <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Nearby services</p>
            <h2 className="mt-1 text-xl font-bold text-slate-950">Emergency resources</h2>
          </div>
          <NavLink to="/services" className="flex min-h-11 shrink-0 items-center font-semibold text-sky-800">Open map</NavLink>
        </div>
        <p role="status" className="mb-3 text-sm text-slate-600">{serviceStatus}</p>
        {services.length ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {services.slice(0, 3).map((service) => (
              <article key={service.id} className="min-w-0 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="font-semibold text-slate-900">{service.name}</p>
                  <span className="rounded-full bg-amber-100 px-2 py-1 text-[10px] font-semibold uppercase text-amber-900">{service.demo ? 'Demo' : 'Provider result'}</span>
                </div>
                <p className="mt-2 break-words text-sm text-slate-600">{service.address}</p>
                <p className="mt-2 break-words text-sm text-slate-600">{service.phone}</p>
                <p className="mt-2 text-sm font-medium text-sky-800">{service.distanceKm} km away</p>
              </article>
            ))}
          </div>
        ) : serviceStatus.startsWith('Loading') ? null : serviceStatus.toLowerCase().includes('unavailable') ? (
          <p role="alert" className="rounded-xl bg-amber-50 p-4 text-sm text-amber-950">{serviceStatus}</p>
        ) : (
          <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-700">No nearby services are available for this location.</p>
        )}
      </section>

      {incident ? (
        <section aria-live="polite" className="rounded-3xl border border-slate-700 bg-slate-900 p-5 text-white">
          <div className="flex items-center gap-3">
            <HeartPulse aria-hidden="true" className="h-6 w-6 text-red-300" />
            <h2 className="text-lg font-semibold">Active incident</h2>
          </div>
          <p className="mt-3 text-sm text-slate-200">{incident.aiSummary}</p>
          <NavLink to="/incidents" className="mt-4 inline-flex min-h-11 items-center font-semibold text-sky-200">View incident status</NavLink>
        </section>
      ) : (
        <NavLink to="/incidents" className="flex min-h-14 items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-sm font-semibold text-slate-800">
          <Shield aria-hidden="true" className="h-5 w-5 text-sky-700" />
          Open incident dashboard
        </NavLink>
      )}
    </div>
  );
}

function ServicesPage() {
  const location = useGeolocation();
  const [category, setCategory] = useState('hospital');
  const [services, setServices] = useState([]);
  const [label, setLabel] = useState('Loading nearby services...');
  const [mobileView, setMobileView] = useState('list');
  const [selectedService, setSelectedService] = useState(null);
  const [desktopMap, setDesktopMap] = useState(() => window.matchMedia('(min-width: 1024px)').matches);

  useEffect(() => {
    const query = window.matchMedia('(min-width: 1024px)');
    const updateLayout = (event) => setDesktopMap(event.matches);
    query.addEventListener('change', updateLayout);
    return () => query.removeEventListener('change', updateLayout);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      try {
        const data = await fetchJson(
          `/services/nearby?lat=${location.latitude}&lng=${location.longitude}&category=${category}`,
          { signal: controller.signal },
        );
        setServices(data.facilities || []);
        setLabel(data.label || 'Nearby services');
        setSelectedService(null);
      } catch {
        if (!controller.signal.aborted) {
          setServices([]);
          setLabel('Service lookup unavailable. Check your connection and try again.');
        }
      }
    };

    load();
    return () => controller.abort();
  }, [category, location.latitude, location.longitude]);

  const center = useMemo(
    () => selectedService
      ? [Number(selectedService.latitude), Number(selectedService.longitude)]
      : [Number(location.latitude), Number(location.longitude)],
    [location.latitude, location.longitude, selectedService],
  );
  const locationDescription = location.permission === 'granted'
    ? 'Showing services near your device location.'
    : 'Showing services near the manually selected reference location; this may not be where you are.';

  return (
    <div className="space-y-4 sm:space-y-6">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-700">Nearby help</p>
        <h1 className="mt-1 text-2xl font-bold text-slate-950">Emergency services</h1>
        <p className="mt-2 text-sm text-slate-600">{locationDescription}</p>
      </header>

      <div className="flex gap-2 overflow-x-auto pb-1" aria-label="Filter services by type">
        {['hospital', 'police', 'fire', 'all'].map((item) => (
          <button
            type="button"
            key={item}
            aria-pressed={category === item}
            onClick={() => setCategory(item)}
            className={`min-h-11 shrink-0 rounded-full border px-4 text-sm font-semibold ${category === item ? 'border-sky-700 bg-sky-50 text-sky-800' : 'border-slate-300 bg-white text-slate-700'}`}
          >
            {item === 'all' ? 'All services' : item[0].toUpperCase() + item.slice(1)}
          </button>
        ))}
      </div>

      <div className="flex justify-end gap-1 rounded-xl bg-slate-100 p-1 lg:hidden">
        <button type="button" aria-pressed={mobileView === 'list'} onClick={() => setMobileView('list')} className={`min-h-11 rounded-lg px-4 text-sm font-semibold ${mobileView === 'list' ? 'bg-white text-sky-900 shadow-sm' : 'text-slate-700'}`}>List</button>
        <button type="button" aria-pressed={mobileView === 'map'} onClick={() => setMobileView('map')} className={`min-h-11 rounded-lg px-4 text-sm font-semibold ${mobileView === 'map' ? 'bg-white text-sky-900 shadow-sm' : 'text-slate-700'}`}>Map</button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(20rem,0.8fr)]">
        <section className={`${mobileView === 'map' ? 'block' : 'hidden'} map-shell overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm lg:block`}>
          {desktopMap || mobileView === 'map' ? (
            <Suspense fallback={<p role="status" className="p-5 text-sm text-slate-700">Loading map…</p>}>
              <ServiceMap
                center={center}
                locationPermission={location.permission}
                services={services}
                onSelect={setSelectedService}
                visible={mobileView === 'map' || desktopMap}
              />
            </Suspense>
          ) : (
            <p className="p-5 text-sm text-slate-700">Open the map to view service locations.</p>
          )}
        </section>

        <section className={`${mobileView === 'list' ? 'block' : 'hidden'} space-y-3 lg:block`}>
          <div className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-700">Service status</p>
              <p role="status" className="mt-1 text-sm text-slate-700">{label}</p>
            </div>
          </div>
          {services.length === 0 ? (
            <p role={label.startsWith('Service lookup unavailable') ? 'alert' : 'status'} className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-700">
              {label.startsWith('Loading') ? 'Searching nearby services…' : label.startsWith('Service lookup unavailable') ? label : 'No services were found for this category and location.'}
            </p>
          ) : services.map((item) => (
            <article key={item.id} className={`rounded-3xl border bg-white p-4 shadow-sm sm:p-5 ${selectedService?.id === item.id ? 'border-sky-500 ring-1 ring-sky-200' : 'border-slate-200'}`}>
              <button type="button" onClick={() => { setSelectedService(item); setMobileView('map'); }} className="min-h-11 w-full text-left">
                <span className="flex flex-wrap items-start justify-between gap-2">
                  <span className="font-semibold text-slate-950">{item.name}</span>
                  <span className="rounded-full bg-amber-100 px-2 py-1 text-[10px] font-semibold uppercase text-amber-950">{item.demo ? 'Demo data' : 'Provider result'}</span>
                </span>
              </button>
              <p className="mt-2 break-words text-sm text-slate-700">{item.address || 'Address unavailable'}</p>
              <p className="mt-1 break-words text-sm text-slate-700">Phone: {item.phone || 'Not available'}</p>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-sm">
                <span className="font-medium text-slate-800">{item.distanceKm} km away</span>
                {Number.isFinite(Number(item.latitude)) && Number.isFinite(Number(item.longitude)) ? (
                  <a className="inline-flex min-h-11 items-center font-semibold text-sky-800 underline" href={`https://www.google.com/maps?q=${item.latitude},${item.longitude}`} target="_blank" rel="noreferrer">
                    Directions
                  </a>
                ) : <span className="text-slate-600">Directions unavailable</span>}
              </div>
            </article>
          ))}
        </section>
      </div>
    </div>
  );
}

function CopilotPage() {
  const [input, setInput] = useState('Give me the safest next step right now.');
  const [messages, setMessages] = useState([
    { role: 'assistant', content: 'I can offer calm, general guidance. This is not a diagnosis and does not contact emergency services.' },
  ]);
  const [incidents, setIncidents] = useState([]);
  const [selectedIncidentId, setSelectedIncidentId] = useState('');
  const [incidentContextUnavailable, setIncidentContextUnavailable] = useState(false);
  const [sending, setSending] = useState(false);
  const incident = incidents.find((item) => item.id === selectedIncidentId) || null;

  useEffect(() => {
    const controller = new AbortController();
    fetchJson('/incidents', { signal: controller.signal })
      .then((data) => {
        setIncidents(data.incidents || []);
        setSelectedIncidentId(data.incidents?.[0]?.id || '');
        setIncidentContextUnavailable(false);
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setIncidents([]);
          setSelectedIncidentId('');
          setIncidentContextUnavailable(true);
        }
      });
    return () => controller.abort();
  }, []);

  const sendMessage = async (messageText = input) => {
    const message = messageText.trim();
    if (!message || sending) return;
    const nextMessage = { role: 'user', content: message };
    setMessages((prev) => [...prev, nextMessage]);
    setInput('');
    setSending(true);

    try {
      const response = await API.post('/copilot/chat', {
        message,
        ...(incident ? { incidentId: incident.id } : {}),
      }, { headers: getAuthHeader() });
      setMessages((prev) => [...prev, { role: 'assistant', content: response.data.response }]);
    } catch {
      setMessages((prev) => [...prev, { role: 'assistant', content: 'The assistant is temporarily unavailable. Contact emergency services if this is urgent.' }]);
    } finally {
      setSending(false);
    }
  };

  const prepareSummary = async () => {
    if (!incident || sending) return;
    setSending(true);
    try {
      const response = await API.post('/copilot/summary', { incidentId: incident.id }, { headers: getAuthHeader() });
      const summary = response.data.summary;
      setMessages((previous) => [...previous, {
        role: 'assistant',
        content: `Emergency summary — ${summary.incidentCategory}: ${summary.userReportedDescription} Recommended next action: ${summary.recommendedNextAction}`,
      }]);
    } catch {
      setMessages((previous) => [...previous, { role: 'assistant', content: 'The incident summary could not be prepared. Contact emergency services directly if this is urgent.' }]);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(16rem,0.8fr)_minmax(0,1.2fr)] lg:gap-6">
      <section className="order-2 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5 lg:order-1">
        <div className="mb-4 flex items-center gap-3">
          <Bot aria-hidden="true" className="h-5 w-5 text-sky-700" />
          <h2 className="text-xl font-bold text-slate-900">Incident context</h2>
        </div>
        {incidents.length > 1 ? (
          <label className="mb-4 block text-sm font-medium text-slate-800">
            Selected incident
            <select value={selectedIncidentId} onChange={(event) => setSelectedIncidentId(event.target.value)} className="mt-1 min-h-12 w-full rounded-xl border border-slate-300 bg-white px-3 text-base">
              {incidents.map((item) => <option key={item.id} value={item.id}>{item.category} · {new Date(item.createdAt).toLocaleString()}</option>)}
            </select>
          </label>
        ) : null}
        {incident ? (
          <div className="space-y-3 text-sm text-slate-700">
            <p><span className="font-semibold">Status:</span> {incident.status}</p>
            <p><span className="font-semibold">Category:</span> {incident.category}</p>
            <p className="break-words"><span className="font-semibold">Situation:</span> {incident.description}</p>
            <p><span className="font-semibold">Created:</span> {new Date(incident.createdAt).toLocaleString()}</p>
          </div>
        ) : (
          <p className="text-sm text-slate-700">{incidentContextUnavailable ? 'Incident context is currently unavailable.' : 'No incident context is currently available.'} You can still ask for general guidance or start an SOS from Home.</p>
        )}
        <NavLink to="/services" className="mt-4 inline-flex min-h-11 items-center font-semibold text-sky-800 underline">Find nearby help</NavLink>
      </section>

      <section className="order-1 flex min-w-0 flex-col rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5 lg:order-2">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-xl font-bold text-slate-900">Emergency copilot</h2>
          <span className="rounded-full bg-sky-100 px-3 py-1.5 text-xs font-semibold text-sky-950">Advisory guidance</span>
        </div>
        <div aria-live="polite" aria-relevant="additions text" className="chat-messages flex min-h-64 max-h-[52dvh] flex-col gap-3 overflow-y-auto rounded-2xl bg-slate-50 p-3 sm:p-4">
          {messages.map((message, index) => (
            <div key={`${message.role}-${index}`} className={`max-w-[92%] break-words rounded-2xl px-3 py-2 text-sm ${message.role === 'assistant' ? 'self-start bg-white text-slate-800 shadow-sm' : 'self-end bg-sky-800 text-white'}`}>
              {message.content}
            </div>
          ))}
          {sending ? <p role="status" className="self-start rounded-xl bg-white px-3 py-2 text-sm text-slate-600">Preparing guidance…</p> : null}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" disabled={sending || !incident} onClick={prepareSummary} className="min-h-11 rounded-full border border-slate-300 px-3 text-sm font-medium text-slate-800 disabled:opacity-60">Prepare emergency summary</button>
        </div>
        <form
          onSubmit={(event) => { event.preventDefault(); sendMessage(); }}
          className="sticky bottom-[calc(4rem+env(safe-area-inset-bottom))] z-10 mt-2 flex gap-2 bg-white py-2 lg:static"
        >
          <label htmlFor="copilot-message" className="sr-only">Message the emergency copilot</label>
          <input
            id="copilot-message"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            className="min-h-12 min-w-0 flex-1 rounded-2xl border border-slate-300 bg-slate-50 px-3 text-base outline-none focus:border-sky-700"
            placeholder="Ask for next steps…"
            autoComplete="off"
          />
          <button type="submit" disabled={sending || !input.trim()} aria-label="Send message" className="inline-flex min-h-12 shrink-0 items-center justify-center gap-2 rounded-2xl bg-sky-800 px-4 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60">
            <Send aria-hidden="true" className="h-4 w-4" /><span className="hidden sm:inline">Send</span>
          </button>
        </form>
        <p className="mt-1 text-xs text-slate-600">For immediate danger, use SOS or contact local emergency services directly.</p>
      </section>
    </div>
  );
}

function IncidentStatusPage() {
  const [incidents, setIncidents] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [timeline, setTimeline] = useState({ incidentId: '', entries: [] });
  const [alerts, setAlerts] = useState({ incidentId: '', entries: [] });
  const [alertStatusMessage, setAlertStatusMessage] = useState('');
  const [loadStatus, setLoadStatus] = useState('Loading incidents…');
  const [actionStatus, setActionStatus] = useState('');
  const [updating, setUpdating] = useState(false);

  const loadIncidents = async () => {
    try {
      const data = await fetchJson('/incidents');
      setIncidents(data.incidents || []);
      setSelectedId((current) => current || data.incidents?.[0]?.id || '');
      setLoadStatus(data.incidents?.length ? '' : 'No incidents yet.');
    } catch {
      setLoadStatus('Incident records are unavailable. Check your connection and try again.');
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    fetchJson('/incidents', { signal: controller.signal })
      .then((data) => {
        setIncidents(data.incidents || []);
        setSelectedId(data.incidents?.[0]?.id || '');
        setLoadStatus(data.incidents?.length ? '' : 'No incidents yet.');
      })
      .catch(() => {
        if (!controller.signal.aborted) setLoadStatus('Incident records are unavailable. Check your connection and try again.');
      });
    return () => controller.abort();
  }, []);

  const selected = incidents.find((item) => item.id === selectedId) || incidents[0];
  const selectedIncidentId = selected?.id;
  const currentTimeline = timeline.incidentId === selectedIncidentId ? timeline.entries : [];
  const currentAlerts = alerts.incidentId === selectedIncidentId ? alerts.entries : [];

  useEffect(() => {
    if (!selectedIncidentId) return undefined;
    const controller = new AbortController();
    fetchJson(`/incidents/${selectedIncidentId}/timeline`, { signal: controller.signal })
      .then((data) => setTimeline({ incidentId: selectedIncidentId, entries: data.timeline || [] }))
      .catch(() => {
        if (!controller.signal.aborted) setTimeline({ incidentId: selectedIncidentId, entries: [] });
      });
    return () => controller.abort();
  }, [selectedIncidentId]);

  useEffect(() => {
    if (!selectedIncidentId) return undefined;
    let active = true;
    const token = localStorage.getItem('safesphere-token') || defaultToken;
    const refreshAlerts = () => {
      fetchJson(`/incidents/${selectedIncidentId}/alerts`)
        .then((data) => {
          if (!active) return;
          setAlerts({ incidentId: selectedIncidentId, entries: data.alerts || [] });
          setAlertStatusMessage('');
        })
        .catch(() => {
          if (active) setAlertStatusMessage('Notification status could not be refreshed.');
        });
    };
    refreshAlerts();
    const socket = io(SOCKET_URL, { auth: { token } });
    socket.on('connect', () => socket.emit('join-incident', selectedIncidentId));
    socket.on('connect_error', () => {
      if (active) setAlertStatusMessage('Live updates are unavailable. Status is refreshed periodically.');
    });
    socket.on('incident-update', (update) => {
      if (update.incidentId === selectedIncidentId) refreshAlerts();
    });
    const refreshTimer = window.setInterval(refreshAlerts, 15000);
    return () => {
      active = false;
      window.clearInterval(refreshTimer);
      socket.emit('leave-incident', selectedIncidentId);
      socket.disconnect();
    };
  }, [selectedIncidentId]);

  const updateIncident = async (endpoint) => {
    if (!selected) return;
    const action = endpoint === 'resolve' ? 'resolve this incident' : 'cancel this incident';
    if (!window.confirm(`Are you sure you want to ${action}?`)) return;
    setUpdating(true);
    setActionStatus('Updating incident status…');
    try {
      await API.post(`/incidents/${selected.id}/${endpoint}`, {}, { headers: getAuthHeader() });
      setActionStatus('Incident status updated.');
      await loadIncidents();
    } catch {
      setActionStatus('Incident status could not be updated. Check your connection and try again.');
    } finally {
      setUpdating(false);
    }
  };

  return (
    <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(17rem,0.6fr)_minmax(0,1.4fr)] lg:gap-6">
      <section className="min-w-0 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
        <h1 className="text-xl font-bold text-slate-950">Recent incidents</h1>
        {loadStatus ? <p role={incidents.length ? 'status' : 'alert'} className="mt-3 text-sm text-slate-700">{loadStatus}</p> : null}
        <div className="mt-4 space-y-3">
          {incidents.map((incident) => (
            <button
              type="button"
              key={incident.id}
              onClick={() => setSelectedId(incident.id)}
              className={`w-full rounded-2xl border p-3 text-left ${selectedId === incident.id ? 'border-sky-500 bg-sky-50' : 'border-slate-200 bg-slate-50'}`}
            >
              <p className="font-semibold text-slate-900">{incident.category}</p>
              <p className="mt-1 break-words text-sm text-slate-700">{incident.description}</p>
              <p className="mt-2 text-xs font-semibold uppercase tracking-[0.1em] text-slate-700">Status: {incident.status}</p>
            </button>
          ))}
        </div>
      </section>

      {selected ? (
        <section className="min-w-0 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-800">Incident status</p>
              <h2 className="mt-2 text-2xl font-bold capitalize text-slate-950">{selected.category}</h2>
            </div>
            <span className="rounded-full bg-slate-100 px-3 py-2 text-xs font-semibold uppercase text-slate-900">Status: {selected.status}</span>
          </div>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl bg-slate-50 p-4">
              <p className="text-sm font-medium text-slate-700">Description</p>
              <p className="mt-2 break-words text-sm text-slate-900">{selected.description}</p>
            </div>
            <div className="rounded-2xl bg-slate-50 p-4">
              <p className="text-sm font-medium text-slate-700">Location</p>
              <p className="mt-2 break-words text-sm text-slate-900">{selected.location?.latitude}, {selected.location?.longitude}</p>
              <p className="mt-2 text-xs text-slate-700">Created: {selected.createdAt ? new Date(selected.createdAt).toLocaleString() : 'Unavailable'}</p>
            </div>
          </div>

          {selected.urgencyEstimate && selected.urgencyEstimate !== 'unknown' ? (
            <p className="mt-4 text-sm font-semibold text-slate-800">Urgency estimate: {selected.urgencyEstimate}</p>
          ) : null}
          {['active', 'pending'].includes(selected.status) ? (
            <div className="mt-5 flex flex-col gap-3 sm:flex-row">
              <button type="button" disabled={updating} onClick={() => updateIncident('resolve')} className="min-h-12 rounded-2xl bg-emerald-800 px-5 font-semibold text-white disabled:opacity-60">Resolve incident</button>
              <button type="button" disabled={updating} onClick={() => updateIncident('cancel')} className="min-h-12 rounded-2xl bg-slate-800 px-5 font-semibold text-white disabled:opacity-60">Cancel incident</button>
            </div>
          ) : null}
          {actionStatus ? <p role="status" className="mt-3 text-sm text-slate-700">{actionStatus}</p> : null}

          <div className="mt-6">
            <p className="text-sm font-semibold text-slate-900">Contact notification status</p>
            {alertStatusMessage ? <p role="status" className="mt-2 text-sm text-slate-700">{alertStatusMessage}</p> : null}
            {currentAlerts.length ? (
              <ul className="mt-3 space-y-2">
                {currentAlerts.map((alert) => {
                  const status = describeAlertStatus(alert.status);
                  return (
                    <li key={alert.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
                      <p className="font-semibold text-slate-900">{alert.channel?.toUpperCase() || 'ALERT'}: {status.label}</p>
                      <p className="mt-1 text-slate-700">{alert.failureReason || status.description}</p>
                      {alert.updatedAt ? <p className="mt-1 text-xs text-slate-700">Updated {new Date(alert.updatedAt).toLocaleString()}</p> : null}
                    </li>
                  );
                })}
              </ul>
            ) : <p className="mt-2 text-sm text-slate-700">No contact notification status is available yet.</p>}
          </div>

          <div className="mt-6">
            <p className="text-sm font-semibold text-slate-900">Incident timeline</p>
            {currentTimeline.length ? (
              <ol className="mt-3 space-y-3 border-l-2 border-slate-200 pl-4">
                {currentTimeline.map((event) => (
                  <li key={event.id} className="break-words text-sm text-slate-800">
                    <p className="font-semibold">{String(event.eventType || 'update').replaceAll('_', ' ')}</p>
                    <p className="mt-0.5 text-xs text-slate-700">{event.timestamp ? new Date(event.timestamp).toLocaleString() : 'Time unavailable'}</p>
                  </li>
                ))}
              </ol>
            ) : <p className="mt-2 text-sm text-slate-700">No timeline updates are available.</p>}
          </div>

          <div className="mt-6">
            <p className="text-sm font-semibold text-slate-900">Recommended actions</p>
            <ul className="mt-3 space-y-2 text-sm text-slate-600">
              {selected.recommendedActions?.map((action) => (
                <li key={action} className="flex gap-2"><CheckCircle2 aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-emerald-800" /><span>{action}</span></li>
              ))}
            </ul>
          </div>
        </section>
      ) : !loadStatus ? <p className="rounded-3xl border border-slate-200 bg-white p-5 text-sm text-slate-700">Select an incident to review its status.</p> : null}
    </div>
  );
}

function ContactsPage() {
  const [contacts, setContacts] = useState([]);
  const emptyForm = { name: '', phone: '', email: '', priority: 1, notificationPreference: 'sms', smsConsent: false };
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState('');
  const [status, setStatus] = useState('Loading trusted contacts…');

  const loadContacts = async () => {
    try {
      const data = await fetchJson('/contacts');
      setContacts(data.contacts || []);
      setStatus(data.contacts?.length ? '' : 'No trusted contacts have been added yet.');
    } catch {
      setStatus('Contacts are unavailable. Check your connection and try again.');
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    fetchJson('/contacts', { signal: controller.signal })
      .then((data) => {
        setContacts(data.contacts || []);
        setStatus(data.contacts?.length ? '' : 'No trusted contacts have been added yet.');
      })
      .catch(() => {
        if (!controller.signal.aborted) setStatus('Contacts are unavailable. Check your connection and try again.');
      });
    return () => controller.abort();
  }, []);

  const saveContact = async (event) => {
    event.preventDefault();
    try {
      if (editingId) {
        await API.patch(`/contacts/${editingId}`, form, { headers: getAuthHeader() });
      } else {
        await API.post('/contacts', form, { headers: getAuthHeader() });
      }
      setForm(emptyForm);
      setEditingId('');
      const successStatus = editingId ? 'Contact updated.' : 'Contact saved. Verification is still required.';
      await loadContacts();
      setStatus(successStatus);
    } catch (error) {
      setStatus(error.response?.data?.message || 'Contact could not be saved. Check the details and try again.');
    }
  };

  const editContact = (contact) => {
    setEditingId(contact.id);
    setForm({
      name: contact.name || '',
      phone: contact.phone || '',
      email: contact.email || '',
      priority: contact.priority || 1,
      notificationPreference: contact.notificationPreference || 'sms',
      smsConsent: contact.smsConsent === true,
    });
  };

  const deleteContact = async (contact) => {
    if (!window.confirm(`Delete ${contact.name} from trusted contacts?`)) return;
    try {
      await API.delete(`/contacts/${contact.id}`, { headers: getAuthHeader() });
      setStatus('Contact deleted.');
      if (editingId === contact.id) {
        setEditingId('');
        setForm(emptyForm);
      }
      await loadContacts();
      setStatus('Contact deleted.');
    } catch {
      setStatus('Contact could not be deleted. Check your connection and try again.');
    }
  };

  return (
    <div className="grid min-w-0 gap-4 lg:grid-cols-2 lg:gap-6">
      <section className="min-w-0 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
        <h1 className="text-xl font-bold text-slate-950">Trusted contacts</h1>
        <p role={status.startsWith('Contacts are') ? 'alert' : 'status'} className="mt-2 text-sm text-slate-700">{status}</p>
        <div className="mt-5 space-y-3">
          {contacts.map((contact) => (
            <article key={contact.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="break-words font-semibold text-slate-950">{contact.name}</p>
                  <a className="mt-1 inline-flex min-h-11 items-center break-all text-sm text-sky-900 underline" href={`tel:${contact.phone}`}>{contact.phone}</a>
                  {contact.email ? <a className="block min-h-11 content-center break-all text-sm text-sky-900 underline" href={`mailto:${contact.email}`}>{contact.email}</a> : null}
                  <p className="mt-1 text-sm text-slate-700">Preference: {contact.notificationPreference || 'Not set'} · Priority {contact.priority || 'Not set'}</p>
                  <p className="mt-1 text-sm text-slate-700">Emergency SMS consent: {contact.smsConsent ? 'Yes' : 'No'}</p>
                </div>
                <span className={`rounded-full px-3 py-1.5 text-xs font-semibold ${contact.verified ? 'bg-emerald-100 text-emerald-950' : 'bg-amber-100 text-amber-950'}`}>
                  {contact.verified ? 'Verified' : 'Not verified'}
                </span>
              </div>
              <div className="mt-3 flex gap-2">
                <button type="button" onClick={() => editContact(contact)} className="min-h-11 rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-800">Edit</button>
                <button type="button" onClick={() => deleteContact(contact)} className="min-h-11 rounded-xl border border-red-300 bg-white px-4 text-sm font-semibold text-red-800">Delete</button>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
        <h2 className="text-xl font-bold text-slate-950">{editingId ? 'Edit contact' : 'Add trusted contact'}</h2>
        <form onSubmit={saveContact} className="mt-5 space-y-4">
          <label className="block text-sm font-medium text-slate-800">
            Name
            <input required maxLength="100" autoComplete="name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className="mt-1 min-h-12 w-full rounded-2xl border border-slate-300 bg-slate-50 px-3 text-base" />
          </label>
          <label className="block text-sm font-medium text-slate-800">
            Phone (international E.164 format)
            <input
              required
              type="tel"
              autoComplete="tel"
              pattern={form.notificationPreference === 'sms' ? '[+][1-9][0-9]{7,14}' : undefined}
              title="Use a country code and digits, for example +14155552671."
              placeholder="+14155552671"
              value={form.phone}
              onChange={(event) => setForm({ ...form, phone: event.target.value })}
              className="mt-1 min-h-12 w-full rounded-2xl border border-slate-300 bg-slate-50 px-3 text-base"
            />
          </label>
          <label className="block text-sm font-medium text-slate-800">
            Email (optional)
            <input type="email" autoComplete="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} className="mt-1 min-h-12 w-full rounded-2xl border border-slate-300 bg-slate-50 px-3 text-base" />
          </label>
          <label className="block text-sm font-medium text-slate-800">
            Notification preference
            <select value={form.notificationPreference} onChange={(event) => setForm({ ...form, notificationPreference: event.target.value })} className="mt-1 min-h-12 w-full rounded-2xl border border-slate-300 bg-slate-50 px-3 text-base">
              <option value="sms">SMS</option>
              <option value="email">Email</option>
              <option value="push">Push</option>
            </select>
          </label>
          <label className="flex min-h-12 items-start gap-3 rounded-xl border border-slate-200 p-3 text-sm text-slate-800">
            <input
              type="checkbox"
              checked={form.smsConsent}
              onChange={(event) => setForm({ ...form, smsConsent: event.target.checked })}
              className="mt-0.5 h-5 w-5 shrink-0 accent-sky-800"
            />
            <span>This contact has agreed to receive emergency SMS alerts.</span>
          </label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <button type="submit" className="min-h-12 flex-1 rounded-2xl bg-sky-800 px-4 font-semibold text-white">{editingId ? 'Save changes' : 'Save contact'}</button>
            {editingId ? <button type="button" onClick={() => { setEditingId(''); setForm(emptyForm); }} className="min-h-12 rounded-2xl border border-slate-300 px-4 font-semibold text-slate-800">Cancel edit</button> : null}
          </div>
        </form>
        <p className="mt-4 text-xs text-slate-700">New contacts are not verified automatically. Confirm their details before relying on them.</p>
      </section>
    </div>
  );
}

function JourneyPage() {
  const [journeys, setJourneys] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [form, setForm] = useState(() => {
    const arrival = new Date(Date.now() + 60 * 60 * 1000);
    return {
      destination: '',
      expectedArrival: new Date(arrival.getTime() - arrival.getTimezoneOffset() * 60000).toISOString().slice(0, 16),
      trustedContactId: '',
    };
  });
  const [status, setStatus] = useState('Loading journey details…');
  const [saving, setSaving] = useState(false);

  const loadJourneys = async () => {
    try {
      const [journeyData, contactData] = await Promise.all([
        fetchJson('/journeys/active'),
        fetchJson('/contacts'),
      ]);
      setJourneys(journeyData.journeys || []);
      setContacts(contactData.contacts || []);
      setForm((previous) => ({
        ...previous,
        trustedContactId: previous.trustedContactId || contactData.contacts?.[0]?.id || '',
      }));
      setStatus('');
    } catch {
      setStatus('Journey information is unavailable. Check your connection and try again.');
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      fetchJson('/journeys/active', { signal: controller.signal }),
      fetchJson('/contacts', { signal: controller.signal }),
    ])
      .then(([journeyData, contactData]) => {
        setJourneys(journeyData.journeys || []);
        setContacts(contactData.contacts || []);
        setForm((previous) => ({
          ...previous,
          trustedContactId: previous.trustedContactId || contactData.contacts?.[0]?.id || '',
        }));
        setStatus('');
      })
      .catch(() => {
        if (!controller.signal.aborted) setStatus('Journey information is unavailable. Check your connection and try again.');
      });
    return () => controller.abort();
  }, []);

  const createJourney = async (event) => {
    event.preventDefault();
    setSaving(true);
    setStatus('Starting your safety journey…');
    try {
      await API.post('/journeys', form, { headers: getAuthHeader() });
      await loadJourneys();
      setStatus('Journey started.');
    } catch (error) {
      setStatus(error.response?.data?.message || 'Journey could not be started. Check your details and try again.');
    } finally {
      setSaving(false);
    }
  };

  const updateJourney = async (journey, action) => {
    if (action === 'cancel' && !window.confirm(`Cancel your safety journey to ${journey.destination}?`)) return;
    try {
      const response = await API.post(`/journeys/${journey.id}/${action}`, {}, { headers: getAuthHeader() });
      const updated = response.data.journey;
      setJourneys((previous) => previous.map((item) => item.id === updated.id ? updated : item));
      setStatus(`Journey status: ${updated.status}.`);
    } catch {
      setStatus('Journey status could not be updated. Check your connection and try again.');
    }
  };

  return (
    <div className="grid min-w-0 gap-4 lg:grid-cols-2 lg:gap-6">
      <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
        <h1 className="text-xl font-bold text-slate-950">Safety journey</h1>
        <p className="mt-2 text-sm text-slate-700">Set your destination and expected arrival, then check in when you are safe.</p>
        <form onSubmit={createJourney} className="mt-5 space-y-4">
          <label className="block text-sm font-medium text-slate-800">
            Destination
            <input required maxLength="200" value={form.destination} onChange={(event) => setForm({ ...form, destination: event.target.value })} placeholder="Where are you going?" className="mt-1 min-h-12 w-full rounded-2xl border border-slate-300 bg-slate-50 px-3 text-base" />
          </label>
          <label className="block text-sm font-medium text-slate-800">
            Expected arrival
            <input required type="datetime-local" value={form.expectedArrival} onChange={(event) => setForm({ ...form, expectedArrival: event.target.value })} className="mt-1 min-h-12 w-full rounded-2xl border border-slate-300 bg-slate-50 px-3 text-base" />
          </label>
          <label className="block text-sm font-medium text-slate-800">
            Trusted contact
            <select value={form.trustedContactId} onChange={(event) => setForm({ ...form, trustedContactId: event.target.value })} className="mt-1 min-h-12 w-full rounded-2xl border border-slate-300 bg-slate-50 px-3 text-base">
              <option value="">No contact selected</option>
              {contacts.map((contact) => <option key={contact.id} value={contact.id}>{contact.name}{contact.verified ? ' (verified)' : ' (not verified)'}</option>)}
            </select>
          </label>
          <button type="submit" disabled={saving} className="min-h-14 w-full rounded-2xl bg-sky-800 px-4 text-base font-bold text-white disabled:opacity-60">Start journey</button>
        </form>
        {status ? <p role="status" className="mt-3 text-sm text-slate-700">{status}</p> : null}
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
        <h2 className="text-xl font-bold text-slate-950">Journey status</h2>
        {journeys.length === 0 ? (
          <p className="mt-5 text-sm text-slate-700">{status.startsWith('Journey information') ? status : 'No active safety journeys yet.'}</p>
        ) : (
          <div className="mt-5 space-y-3">
            {journeys.map((journey) => (
              <article key={journey.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="break-words font-semibold text-slate-950">{journey.destination}</p>
                <p className="mt-2 text-sm text-slate-800">Status: {journey.status}</p>
                <p className="mt-1 flex items-start gap-2 break-words text-sm text-slate-700"><Clock3 aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" /> Expected arrival: {journey.expectedArrival ? new Date(journey.expectedArrival).toLocaleString() : 'Not provided'}</p>
                {journey.nextCheckInAt ? <p className="mt-1 text-sm text-slate-700">Check-in due: {new Date(journey.nextCheckInAt).toLocaleString()}</p> : null}
                {journey.status === 'active' ? (
                  <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                    <button type="button" onClick={() => updateJourney(journey, 'check-in')} className="min-h-14 flex-1 rounded-2xl bg-emerald-800 px-4 font-bold text-white">I’m safe — check in</button>
                    <button type="button" onClick={() => updateJourney(journey, 'complete')} className="min-h-12 rounded-2xl border border-slate-300 bg-white px-4 font-semibold text-slate-800">Complete</button>
                    <button type="button" onClick={() => updateJourney(journey, 'cancel')} className="min-h-12 rounded-2xl border border-red-300 bg-white px-4 font-semibold text-red-800">Cancel</button>
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function AuthPage() {
  const [user, setUser] = useState(null);
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [status, setStatus] = useState('Checking sign-in status…');

  useEffect(() => {
    const controller = new AbortController();
    fetchJson('/auth/me', { signal: controller.signal })
      .then((data) => {
        setUser(data.user);
        setStatus('');
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setUser(null);
          setStatus('Sign in to view your account details.');
        }
      });
    return () => controller.abort();
  }, []);

  const submit = async (event) => {
    event.preventDefault();
    try {
    const endpoint = mode === 'register' ? '/auth/register' : '/auth/login';
    const payload = mode === 'register' ? form : { email: form.email, password: form.password };
    const response = await API.post(endpoint, payload, { headers: { Authorization: `Bearer ${defaultToken}` } });
    localStorage.setItem('safesphere-token', response.data.token || defaultToken);
    setUser(response.data.user || null);
    setStatus(response.data.user ? `Signed in as ${response.data.user.name}.` : 'Sign-in response did not include a user profile.');
    } catch (error) {
      setStatus(error.response?.data?.message || 'Unable to sign in. Check your details and connection.');
    }
  };

  return (
    <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(16rem,0.9fr)_minmax(0,1.1fr)] lg:gap-6">
      <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
        <div className="flex items-center gap-3">
          <UserRound aria-hidden="true" className="h-5 w-5 text-sky-800" />
          <h1 className="text-xl font-bold text-slate-950">Profile &amp; settings</h1>
        </div>
        <div className="mt-5 space-y-3 text-sm text-slate-700">
          {user ? (
            <>
              <p className="break-words"><span className="font-semibold">Name:</span> {user.name}</p>
              <p className="break-words"><span className="font-semibold">Email:</span> {user.email}</p>
              {user.preferredLanguage ? <p><span className="font-semibold">Language:</span> {user.preferredLanguage}</p> : null}
              {user.consent?.locationSharing !== undefined ? <p><span className="font-semibold">Location sharing:</span> {user.consent.locationSharing ? 'Enabled' : 'Disabled'}</p> : null}
            </>
          ) : <p>{status}</p>}
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
        <div className="mb-4 flex gap-2">
          <button type="button" aria-pressed={mode === 'login'} onClick={() => setMode('login')} className={`min-h-11 rounded-full px-4 text-sm font-medium ${mode === 'login' ? 'bg-sky-800 text-white' : 'bg-slate-100 text-slate-800'}`}>Login</button>
          <button type="button" aria-pressed={mode === 'register'} onClick={() => setMode('register')} className={`min-h-11 rounded-full px-4 text-sm font-medium ${mode === 'register' ? 'bg-sky-800 text-white' : 'bg-slate-100 text-slate-800'}`}>Register</button>
        </div>
        <form onSubmit={submit} className="space-y-4">
          {mode === 'register' ? (
            <label className="block text-sm font-medium text-slate-800">
              Full name
              <input required autoComplete="name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className="mt-1 min-h-12 w-full rounded-2xl border border-slate-300 bg-slate-50 px-3 text-base" />
            </label>
          ) : null}
          <label className="block text-sm font-medium text-slate-800">
            Email
            <input required type="email" autoComplete="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} className="mt-1 min-h-12 w-full rounded-2xl border border-slate-300 bg-slate-50 px-3 text-base" />
          </label>
          <label className="block text-sm font-medium text-slate-800">
            Password
            <input required minLength={mode === 'register' ? 8 : undefined} type="password" autoComplete={mode === 'register' ? 'new-password' : 'current-password'} value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} className="mt-1 min-h-12 w-full rounded-2xl border border-slate-300 bg-slate-50 px-3 text-base" />
          </label>
          <button type="submit" className="min-h-12 w-full rounded-2xl bg-sky-800 px-4 font-semibold text-white">{mode === 'register' ? 'Create account' : 'Login'}</button>
        </form>
        {status ? <p role={user ? 'status' : 'alert'} className="mt-4 text-sm text-slate-700">{status}</p> : null}
        {user ? <p className="mt-2 text-sm font-semibold text-emerald-900">Signed in as {user.name}</p> : null}
      </section>
    </div>
  );
}

const navItems = [
  { label: 'Home', path: '/', icon: Shield },
  { label: 'Services', path: '/services', icon: MapPinned },
  { label: 'Copilot', path: '/copilot', icon: Bot },
  { label: 'Incidents', path: '/incidents', icon: AlertTriangle },
  { label: 'Contacts', path: '/contacts', icon: Users },
  { label: 'Journey', path: '/journey', icon: Navigation },
  { label: 'Auth', path: '/auth', icon: UserRound },
];

const mobileNavItems = [
  { label: 'Home', path: '/', icon: Home },
  { label: 'Nearby', path: '/services', icon: MapPinned },
  { label: 'Copilot', path: '/copilot', icon: Bot },
  { label: 'Contacts', path: '/contacts', icon: Users },
  { label: 'Profile', path: '/auth', icon: UserRound },
];

function Layout() {
  return (
    <div className="min-h-dvh bg-slate-50 text-slate-900">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 pt-[env(safe-area-inset-top)] backdrop-blur-sm">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-3 py-3 sm:px-6">
          <NavLink to="/" aria-label="SafeSphere AI home" className="flex min-w-0 items-center gap-2.5">
            <div className="rounded-xl bg-sky-800 p-2 text-white"><Siren aria-hidden="true" className="h-5 w-5" /></div>
            <div>
              <p className="truncate text-xs font-semibold uppercase tracking-[0.14em] text-slate-600">SafeSphere AI</p>
              <p className="hidden text-sm font-semibold text-slate-900 sm:block">Emergency assistance</p>
            </div>
          </NavLink>
          <nav aria-label="Primary navigation" className="hidden items-center gap-1 lg:flex">
            {navItems.map(({ label, path, icon: Icon }) => (
              <NavLink key={path} to={path} className={({ isActive }) => `inline-flex min-h-11 items-center rounded-full px-3 text-sm font-medium ${isActive ? 'bg-sky-800 text-white' : 'text-slate-700 hover:bg-slate-100'}`}>
                <span className="inline-flex items-center gap-2">
                  <Icon aria-hidden="true" className="h-4 w-4" />
                  {label}
                </span>
              </NavLink>
            ))}
          </nav>
          <NavLink to="/" aria-label="Open emergency SOS controls" className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full bg-red-700 px-4 text-sm font-bold text-white hover:bg-red-800">
            <Siren aria-hidden="true" className="h-4 w-4" />
            SOS
          </NavLink>
        </div>
      </header>

      <main className="app-content mx-auto max-w-7xl px-3 py-4 sm:px-6 sm:py-8">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/services" element={<ServicesPage />} />
          <Route path="/copilot" element={<CopilotPage />} />
          <Route path="/incidents" element={<IncidentStatusPage />} />
          <Route path="/contacts" element={<ContactsPage />} />
          <Route path="/journey" element={<JourneyPage />} />
          <Route path="/auth" element={<AuthPage />} />
        </Routes>
      </main>

      <nav aria-label="Mobile navigation" className="safe-area-bottom fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 px-1 pt-2 shadow-[0_-8px_24px_rgba(15,23,42,0.08)] backdrop-blur-sm lg:hidden">
        <div className="mx-auto grid max-w-xl grid-cols-5">
          {mobileNavItems.map(({ label, path, icon: Icon }) => (
            <NavLink
              key={path}
              to={path}
              aria-label={label}
              className={({ isActive }) => `flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-xl px-1 text-[11px] font-medium ${isActive ? 'text-sky-900' : 'text-slate-600'}`}
            >
              {({ isActive }) => (
                <>
                  <Icon aria-hidden="true" className={`h-5 w-5 ${isActive ? 'stroke-[2.5]' : ''}`} />
                  <span>{label}</span>
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Layout />
    </BrowserRouter>
  );
}
