import { useEffect, useMemo, useState } from 'react';
import { BrowserRouter, NavLink, Route, Routes } from 'react-router-dom';
import axios from 'axios';
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  Clock3,
  MapPinned,
  Navigation,
  Shield,
  Siren,
  UserRound,
  Users,
} from 'lucide-react';
import { MapContainer, Marker, Popup, TileLayer } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

const API = axios.create({ baseURL: '/api/v1' });
const defaultToken = 'demo-token';

function getAuthHeader() {
  const token = localStorage.getItem('safesphere-token') || defaultToken;
  return { Authorization: `Bearer ${token}` };
}

async function fetchJson(url, options = {}) {
  const response = await API.get(url, { headers: getAuthHeader(), ...options });
  return response.data;
}

function useDemoCoordinates() {
  const [location, setLocation] = useState({ latitude: 40.7128, longitude: -74.006, permission: 'demo' });

  useEffect(() => {
    if (!navigator.geolocation) {
      setLocation({ latitude: 40.7128, longitude: -74.006, permission: 'unsupported' });
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocation({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          permission: 'granted',
        });
      },
      () => {
        setLocation({ latitude: 40.7128, longitude: -74.006, permission: 'denied' });
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }, [setLocation]);

  return location;
}

function HomePage() {
  const location = useDemoCoordinates();
  const [description, setDescription] = useState('A person has collapsed and is not responding.');
  const [category, setCategory] = useState('medical');
  const [incident, setIncident] = useState(null);
  const [services, setServices] = useState([]);

  useEffect(() => {
    const loadServices = async () => {
      try {
        const result = await fetchJson(`/services/nearby?lat=${location.latitude}&lng=${location.longitude}&category=hospital`);
        setServices(result.facilities || []);
      } catch (error) {
        setServices([]);
      }
    };

    loadServices();
  }, [location.latitude, location.longitude]);

  const sendSos = async () => {
    try {
      const payload = {
        description,
        category,
        latitude: location.latitude,
        longitude: location.longitude,
        source: 'manual_sos',
      };

      const response = await API.post('/incidents', payload, { headers: getAuthHeader() });
      setIncident(response.data.incident);
    } catch (error) {
      console.error('SOS failed', error.response?.data || error.message);
    }
  };

  const quickCategories = ['medical', 'personal_safety', 'accident', 'fire', 'natural_disaster'];

  return (
    <div className="space-y-8">
      <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-600">Safety Home</p>
              <h1 className="mt-2 text-3xl font-bold text-slate-900">SafeSphere AI</h1>
            </div>
            <button
              type="button"
              onClick={sendSos}
              className="rounded-full bg-red-600 px-6 py-3 text-base font-bold text-white shadow-lg shadow-red-200 transition hover:bg-red-500"
            >
              SOS
            </button>
          </div>

          <div className="mb-5 flex flex-wrap gap-2">
            {quickCategories.map((item) => (
              <button
                type="button"
                key={item}
                onClick={() => setCategory(item)}
                className={`rounded-full border px-3 py-1.5 text-sm font-medium ${category === item ? 'border-sky-600 bg-sky-50 text-sky-700' : 'border-slate-200 bg-slate-50 text-slate-700'}`}
              >
                {item.replace('_', ' ')}
              </button>
            ))}
          </div>

          <label className="mb-2 block text-sm font-medium text-slate-700">Emergency description</label>
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            rows="4"
            className="w-full rounded-2xl border border-slate-200 bg-slate-50 p-3 text-slate-800 outline-none ring-0 focus:border-sky-500"
            placeholder="Describe the emergency or safety issue"
          />

          <div className="mt-4 flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm">
            <span>Current location</span>
            <span className="font-medium text-slate-700">
              {location.permission === 'granted' ? 'Location shared' : 'Demo location active'}
            </span>
          </div>

          {incident ? (
            <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
              Incident created: <span className="font-semibold">{incident.id}</span> • Category: <span className="font-semibold">{incident.category}</span>
            </div>
          ) : null}
        </div>

        <div className="rounded-3xl border border-slate-200 bg-slate-900 p-6 text-white shadow-sm">
          <div className="mb-4 flex items-center gap-3">
            <MapPinned className="h-5 w-5 text-sky-300" />
            <h2 className="text-lg font-semibold">Active incident</h2>
          </div>
          <div className="space-y-4 text-sm text-slate-200">
            <p className="flex items-center justify-between"><span>Permission</span><span className="font-medium text-white">{location.permission}</span></p>
            <p className="flex items-center justify-between"><span>Latitude</span><span>{location.latitude.toFixed(4)}</span></p>
            <p className="flex items-center justify-between"><span>Longitude</span><span>{location.longitude.toFixed(4)}</span></p>
            <p className="rounded-2xl border border-slate-700 bg-slate-800 p-3 text-slate-200">
              {incident ? incident.aiSummary : 'Manual SOS can be started without any AI delay.'}
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Nearby services</p>
            <h2 className="mt-1 text-xl font-bold text-slate-900">Emergency resources</h2>
          </div>
          <NavLink to="/services" className="text-sm font-semibold text-sky-700">Open map</NavLink>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          {services.slice(0, 3).map((service) => (
            <div key={service.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center justify-between">
                <p className="font-semibold text-slate-900">{service.name}</p>
                <span className="rounded-full bg-emerald-100 px-2 py-1 text-[10px] font-semibold uppercase text-emerald-700">{service.demo ? 'Demo' : 'Live'}</span>
              </div>
              <p className="mt-2 text-sm text-slate-600">{service.address}</p>
              <p className="mt-2 text-sm text-slate-600">{service.phone}</p>
              <p className="mt-2 text-sm font-medium text-sky-700">{service.distanceKm} km away</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ServicesPage() {
  const location = useDemoCoordinates();
  const [category, setCategory] = useState('hospital');
  const [services, setServices] = useState([]);
  const [label, setLabel] = useState('Loading nearby services...');

  useEffect(() => {
    const load = async () => {
      try {
        const data = await fetchJson(`/services/nearby?lat=${location.latitude}&lng=${location.longitude}&category=${category}`);
        setServices(data.facilities || []);
        setLabel(data.label || 'Nearby services');
      } catch (_error) {
        setServices([]);
        setLabel('Service lookup unavailable');
      }
    };

    load();
  }, [category, location.latitude, location.longitude]);

  const center = useMemo(() => [location.latitude, location.longitude], [location.latitude, location.longitude]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        {['hospital', 'police', 'fire', 'all'].map((item) => (
          <button
            type="button"
            key={item}
            onClick={() => setCategory(item)}
            className={`rounded-full border px-3 py-1.5 text-sm ${category === item ? 'border-sky-600 bg-sky-50 text-sky-700' : 'border-slate-200 bg-white text-slate-700'}`}
          >
            {item.toUpperCase()}
          </button>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.3fr_0.7fr]">
        <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="h-[420px] w-full">
            <MapContainer center={center} zoom={14} scrollWheelZoom className="h-full w-full">
              <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap contributors" />
              <Marker position={center}>
                <Popup>Your last known location</Popup>
              </Marker>
              {services.map((item) => (
                <Marker key={item.id} position={[item.latitude, item.longitude]}>
                  <Popup>
                    <div>
                      <strong>{item.name}</strong>
                      <p>{item.address}</p>
                    </div>
                  </Popup>
                </Marker>
              ))}
            </MapContainer>
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-600">Service status</p>
            <p className="mt-2 text-sm text-slate-700">{label}</p>
          </div>
          {services.map((item) => (
            <div key={item.id} className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <p className="font-semibold text-slate-900">{item.name}</p>
                <span className="rounded-full bg-amber-100 px-2 py-1 text-[10px] font-semibold uppercase text-amber-700">{item.demo ? 'DEMO' : 'Verified'}</span>
              </div>
              <p className="mt-2 text-sm text-slate-600">{item.address}</p>
              <p className="mt-1 text-sm text-slate-600">{item.phone}</p>
              <div className="mt-3 flex items-center justify-between text-sm text-sky-700">
                <span>{item.distanceKm} km away</span>
                <a href={`https://www.google.com/maps?q=${item.latitude},${item.longitude}`} target="_blank" rel="noreferrer">
                  Directions
                </a>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function CopilotPage() {
  const [input, setInput] = useState('Give me the safest next step right now.');
  const [messages, setMessages] = useState([
    { role: 'assistant', content: 'I can help with calm, factual guidance. Share your concern and I will suggest immediate steps.' },
  ]);

  const sendMessage = async () => {
    if (!input.trim()) return;
    const nextMessage = { role: 'user', content: input };
    setMessages((prev) => [...prev, nextMessage]);
    setInput('');

    try {
      const response = await API.post('/copilot/chat', { message: input }, { headers: getAuthHeader() });
      setMessages((prev) => [...prev, { role: 'assistant', content: response.data.response }]);
    } catch (error) {
      setMessages((prev) => [...prev, { role: 'assistant', content: 'The assistant is temporarily unavailable. Contact emergency services if this is urgent.' }]);
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center gap-3">
          <Bot className="h-5 w-5 text-sky-600" />
          <h2 className="text-xl font-bold text-slate-900">Incident context</h2>
        </div>
        <ul className="space-y-3 text-sm text-slate-700">
          <li>• Category: medical</li>
          <li>• Situation: collapsed person</li>
          <li>• Location permission: demo mode</li>
          <li>• Trust contact: Maya Reed</li>
        </ul>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-bold text-slate-900">Emergency copilot</h2>
          <span className="rounded-full bg-emerald-100 px-2 py-1 text-[10px] font-semibold uppercase text-emerald-700">AI ready</span>
        </div>
        <div className="space-y-3 rounded-2xl bg-slate-50 p-4">
          {messages.map((message, index) => (
            <div key={`${message.role}-${index}`} className={`rounded-2xl px-3 py-2 text-sm ${message.role === 'assistant' ? 'bg-white text-slate-700' : 'bg-sky-600 text-white'}`}>
              {message.content}
            </div>
          ))}
        </div>
        <div className="mt-4 flex gap-3">
          <input
            value={input}
            onChange={(event) => setInput(event.target.value)}
            className="flex-1 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-sky-500"
            placeholder="Ask for next steps..."
          />
          <button type="button" onClick={sendMessage} className="rounded-2xl bg-sky-600 px-4 py-2 text-sm font-semibold text-white">Send</button>
        </div>
      </div>
    </div>
  );
}

function IncidentStatusPage() {
  const [incidents, setIncidents] = useState([]);
  const [selectedId, setSelectedId] = useState('');

  const loadIncidents = async () => {
    const data = await fetchJson('/incidents');
    setIncidents(data.incidents || []);
    if (!selectedId && data.incidents?.[0]) setSelectedId(data.incidents[0].id);
  };

  useEffect(() => {
    loadIncidents();
  }, []);

  const selected = incidents.find((item) => item.id === selectedId) || incidents[0];

  const updateIncident = async (endpoint) => {
    if (!selected) return;
    await API.post(`/incidents/${selected.id}/${endpoint}`, {}, { headers: getAuthHeader() });
    loadIncidents();
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[0.6fr_1.4fr]">
      <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-xl font-bold text-slate-900">Recent incidents</h2>
        <div className="mt-4 space-y-3">
          {incidents.map((incident) => (
            <button
              type="button"
              key={incident.id}
              onClick={() => setSelectedId(incident.id)}
              className={`w-full rounded-2xl border p-3 text-left ${selectedId === incident.id ? 'border-sky-500 bg-sky-50' : 'border-slate-200 bg-slate-50'}`}
            >
              <p className="font-semibold text-slate-900">{incident.category}</p>
              <p className="text-sm text-slate-600">{incident.description}</p>
              <p className="mt-2 text-xs uppercase tracking-[0.1em] text-slate-500">{incident.status}</p>
            </button>
          ))}
        </div>
      </div>

      {selected ? (
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-600">Incident status</p>
              <h2 className="mt-2 text-2xl font-bold text-slate-900">{selected.category}</h2>
            </div>
            <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-semibold uppercase text-red-700">{selected.urgencyEstimate}</span>
          </div>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl bg-slate-50 p-4">
              <p className="text-sm text-slate-500">Description</p>
              <p className="mt-2 text-sm text-slate-800">{selected.description}</p>
            </div>
            <div className="rounded-2xl bg-slate-50 p-4">
              <p className="text-sm text-slate-500">Location</p>
              <p className="mt-2 text-sm text-slate-800">{selected.location?.latitude}, {selected.location?.longitude}</p>
            </div>
          </div>

          <div className="mt-5 flex gap-3">
            <button type="button" onClick={() => updateIncident('resolve')} className="rounded-2xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white">Resolve</button>
            <button type="button" onClick={() => updateIncident('cancel')} className="rounded-2xl bg-slate-800 px-4 py-2 text-sm font-semibold text-white">Cancel</button>
          </div>

          <div className="mt-6">
            <p className="text-sm font-semibold text-slate-700">Recommended actions</p>
            <ul className="mt-3 space-y-2 text-sm text-slate-600">
              {selected.recommendedActions?.map((action) => (
                <li key={action} className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-600" />{action}</li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ContactsPage() {
  const [contacts, setContacts] = useState([]);
  const [form, setForm] = useState({ name: '', phone: '', email: '', priority: 1, notificationPreference: 'sms' });

  const loadContacts = async () => {
    try {
      const data = await fetchJson('/contacts');
      setContacts(data.contacts || []);
    } catch (error) {
      setContacts([]);
    }
  };

  useEffect(() => {
    loadContacts();
  }, []);

  const addContact = async () => {
    if (!form.name || !form.phone) return;
    await API.post('/contacts', form, { headers: getAuthHeader() });
    setForm({ name: '', phone: '', email: '', priority: 1, notificationPreference: 'sms' });
    loadContacts();
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-bold text-slate-900">Trusted contacts</h2>
        <div className="mt-5 space-y-3">
          {contacts.map((contact) => (
            <div key={contact.id} className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 p-3">
              <div>
                <p className="font-semibold text-slate-800">{contact.name}</p>
                <p className="text-sm text-slate-600">{contact.phone} • {contact.notificationPreference}</p>
              </div>
              <span className="rounded-full bg-emerald-100 px-2 py-1 text-[10px] font-semibold uppercase text-emerald-700">Verified</span>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-bold text-slate-900">Add contact</h2>
        <div className="mt-5 space-y-3">
          <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Name" className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm" />
          <input value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} placeholder="Phone" className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm" />
          <input value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} placeholder="Email" className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm" />
          <select value={form.notificationPreference} onChange={(event) => setForm({ ...form, notificationPreference: event.target.value })} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
            <option value="sms">SMS</option>
            <option value="email">Email</option>
            <option value="push">Push</option>
          </select>
          <button type="button" onClick={addContact} className="w-full rounded-2xl bg-sky-600 px-4 py-2 text-sm font-semibold text-white">Save contact</button>
        </div>
      </div>
    </div>
  );
}

function JourneyPage() {
  const [journeys, setJourneys] = useState([]);
  const [form, setForm] = useState({ destination: 'Downtown Station', expectedArrival: '2026-10-10T19:30', trustedContactId: 'contact-1' });

  const loadJourneys = async () => {
    const data = await fetchJson('/journeys/active');
    setJourneys(data.journeys || []);
  };

  useEffect(() => {
    loadJourneys();
  }, []);

  const createJourney = async () => {
    await API.post('/journeys', form, { headers: getAuthHeader() });
    loadJourneys();
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-bold text-slate-900">Safety Journey</h2>
        <div className="mt-5 space-y-3">
          <input value={form.destination} onChange={(event) => setForm({ ...form, destination: event.target.value })} placeholder="Destination" className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm" />
          <input type="datetime-local" value={form.expectedArrival} onChange={(event) => setForm({ ...form, expectedArrival: event.target.value })} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm" />
          <input value={form.trustedContactId} onChange={(event) => setForm({ ...form, trustedContactId: event.target.value })} placeholder="Trusted contact ID" className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm" />
          <button type="button" onClick={createJourney} className="w-full rounded-2xl bg-sky-600 px-4 py-2 text-sm font-semibold text-white">Start journey</button>
        </div>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-bold text-slate-900">Active journey status</h2>
        {journeys.length === 0 ? (
          <p className="mt-5 text-sm text-slate-600">No active safety journeys yet.</p>
        ) : (
          <div className="mt-5 space-y-3">
            {journeys.map((journey) => (
              <div key={journey.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="font-semibold text-slate-900">{journey.destination}</p>
                <p className="mt-1 text-sm text-slate-600">Arrival: {journey.expectedArrival}</p>
                <div className="mt-3 flex items-center gap-2 text-sm text-amber-700"><Clock3 className="h-4 w-4" /> Check in due in 30 minutes</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function AuthPage() {
  const [user, setUser] = useState(null);
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ name: 'Ava Thompson', email: 'ava@example.com', password: 'demo123' });

  useEffect(() => {
    const token = localStorage.getItem('safesphere-token') || defaultToken;
    if (token) {
      setUser({ name: 'Demo user', email: 'ava@example.com' });
    }
  }, []);

  const submit = async () => {
    const endpoint = mode === 'register' ? '/auth/register' : '/auth/login';
    const payload = mode === 'register' ? form : { email: form.email, password: form.password };
    const response = await API.post(endpoint, payload, { headers: { Authorization: `Bearer ${defaultToken}` } });
    localStorage.setItem('safesphere-token', response.data.token || defaultToken);
    setUser(response.data.user || { name: form.name || 'Demo user', email: form.email });
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-3">
          <UserRound className="h-5 w-5 text-sky-600" />
          <h2 className="text-xl font-bold text-slate-900">Profile & settings</h2>
        </div>
        <div className="mt-5 space-y-3 text-sm text-slate-700">
          <p>Language: English</p>
          <p>Location sharing: enabled</p>
          <p>Medical notes: optional consent</p>
          <p>Incident history: 3 reports</p>
        </div>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex gap-2">
          <button type="button" onClick={() => setMode('login')} className={`rounded-full px-3 py-1.5 text-sm font-medium ${mode === 'login' ? 'bg-sky-600 text-white' : 'bg-slate-100 text-slate-700'}`}>Login</button>
          <button type="button" onClick={() => setMode('register')} className={`rounded-full px-3 py-1.5 text-sm font-medium ${mode === 'register' ? 'bg-sky-600 text-white' : 'bg-slate-100 text-slate-700'}`}>Register</button>
        </div>
        {mode === 'register' ? (
          <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Full name" className="mb-3 w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm" />
        ) : null}
        <input value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} placeholder="Email" className="mb-3 w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm" />
        <input type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} placeholder="Password" className="mb-4 w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm" />
        <button type="button" onClick={submit} className="w-full rounded-2xl bg-sky-600 px-4 py-2 text-sm font-semibold text-white">{mode === 'register' ? 'Create account' : 'Login'}</button>
        {user ? <p className="mt-4 text-sm text-emerald-700">Signed in as {user.name}</p> : null}
      </div>
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

function Layout() {
  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/80 backdrop-blur-sm">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-sky-600 p-2 text-white"><Siren className="h-5 w-5" /></div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">SafeSphere AI</p>
              <p className="text-sm font-semibold text-slate-900">Emergency assistance</p>
            </div>
          </div>
          <nav className="hidden gap-2 md:flex">
            {navItems.map(({ label, path, icon: Icon }) => (
              <NavLink key={path} to={path} className={({ isActive }) => `rounded-full px-3 py-2 text-sm font-medium ${isActive ? 'bg-sky-600 text-white' : 'text-slate-700 hover:bg-slate-100'}`}>
                <span className="inline-flex items-center gap-2">
                  <Icon className="h-4 w-4" />
                  {label}
                </span>
              </NavLink>
            ))}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8">
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
