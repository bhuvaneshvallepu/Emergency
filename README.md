# SafeSphere AI — Intelligent Emergency Contact & Assistance System

SafeSphere AI is an emergency assistance platform designed for rapid SOS workflows, nearby emergency service discovery, AI-assisted guidance, and trusted contact escalation.

## Prerequisites

- Node.js 18+
- npm 9+
- MongoDB connection string optional; the app runs in demo mode without it
- Optional OpenAI API key for AI classification and copilot responses
- Optional Places API key for live nearby service data
- Optional Twilio account and SMS-capable sender number for real SMS delivery

## Installation

1. Clone the project and install dependencies in the root, server, and client packages:

```bash
npm install
npm --prefix server install
npm --prefix client install
```

2. Copy `.env.example` to `.env` and fill in your provider credentials.
3. Configure SMS only after you have an authorized Twilio sender and recipient consent.
4. Start the app with:

```bash
npm run dev
```

## Environment setup

```env
PORT=5000
MONGODB_URI=
OPENAI_API_KEY=
PLACES_API_KEY=
SMS_PROVIDER=twilio
SMS_ENABLED=false
SMS_ACCOUNT_ID=
SMS_AUTH_TOKEN=
SMS_FROM_NUMBER=
SMS_STATUS_CALLBACK_URL=
CLIENT_URL=http://localhost:5173
JWT_SECRET=change-me-in-production
DEMO_MODE=true
```

`SMS_ACCOUNT_ID` is the Twilio Account SID, `SMS_AUTH_TOKEN` is its private Auth Token, and `SMS_FROM_NUMBER` is your Twilio sender in E.164 format. `SMS_PROVIDER=twilio` selects the backend provider. Sending remains disabled unless `SMS_ENABLED=true`; keep it false until credentials, an authorized recipient, consent, and any required messaging registration are configured. `SMS_STATUS_CALLBACK_URL` is optional, but must be the exact public HTTPS URL configured below to receive signed delivery updates. Never put these credentials in frontend variables or share them.

## Demo mode

Without MongoDB, incidents, contacts, notification records, and timelines use in-memory demo storage and are lost on restart. Demo nearby-service data is labeled; SMS is not simulated. With SMS disabled, opted-in contacts receive an explicit `disabled` status, and contacts without consent are marked `skipped`. Notification events are persisted to MongoDB when it is connected, but the rest of the current incident/contact workflow still uses the demo store.

## Running the app

- Frontend: http://localhost:5173
- Backend: http://localhost:5000

## Twilio SMS setup

1. Create a Twilio account, then find its Account SID and Auth Token in the Twilio Console. Keep the Auth Token server-side.
2. Obtain/configure a Twilio phone number or approved sender for the destination countries you intend to message. Put it in `SMS_FROM_NUMBER` using E.164 format (for example `+14155552671`).
3. Set `SMS_PROVIDER=twilio`, `SMS_ACCOUNT_ID`, `SMS_AUTH_TOKEN`, and `SMS_FROM_NUMBER` in the root `.env`. Keep `SMS_ENABLED=false` while testing setup.
4. Add trusted contacts using international E.164 phone numbers. Select the SMS notification preference and explicitly check “This contact has agreed to receive emergency SMS alerts.” The consent checkbox records consent only; it does not verify the number or the person.
5. For local callback testing, expose the backend over HTTPS using a tunnel such as `ngrok http 5000`. Set `SMS_STATUS_CALLBACK_URL` to the exact tunnel URL ending in `/api/v1/webhooks/twilio/sms-status`, e.g. `https://<your-tunnel-host>/api/v1/webhooks/twilio/sms-status`. Restart the backend when the tunnel URL changes. In production, set this variable to the exact externally reachable HTTPS callback URL; signature validation uses this configured URL, not forwarded proxy headers.
6. Send a real test only to a number whose owner has explicitly consented and which your Twilio account is authorized to reach. Once ready, set `SMS_ENABLED=true` and trigger SOS. Revert it to `false` to disable sending. Do not use automated tests for live SMS.
7. Start the app with `npm run dev`; backend unit and integration tests use `npm --prefix server test`, and the frontend build/lint use `npm run build` and `npm --prefix client run lint`.

Twilio trial accounts may only message verified destination numbers and may add trial wording. Delivery depends on provider acceptance, carrier delivery, destination-country rules, sender registration, and regulatory requirements. India may require approved sender IDs, templates, or registration (including applicable DLT requirements); confirm current requirements with Twilio and local regulators. An accepted/sent status is not delivery confirmation. The signed webhook may later update it to delivered or undelivered.

Troubleshooting: verify the Account SID/Auth Token pair for authentication errors, ensure the sender supports the destination, verify the trial recipient in Twilio Console, use an E.164 number, and inspect the notification status/failure code for provider-reported delivery problems. For callbacks, confirm the request reaches the exact HTTPS `SMS_STATUS_CALLBACK_URL`, the backend has the same Auth Token, and a reverse proxy preserves the request body. Do not disable signature validation to work around callback failures.

### SMS operational limitations

The current SOS and contact source records are still held in the in-memory demo store, so production incident/contact persistence and cross-restart recovery are not complete. Notification event records can be persisted to MongoDB when connected. There is no durable queue, automatic retry policy, or outage recovery worker; a process crash during a provider request can leave an alert requiring manual review. Configure monitoring and operational escalation before production use. SMS delivery is not guaranteed and this app is not a substitute for official emergency services.

## Mobile and accessibility

The same React application adapts its navigation and page layouts for phone, tablet, and desktop widths. Narrow screens use a safe-area-aware bottom navigation, touch-sized controls, and a list/map switch for nearby services. GPS coordinates and the KPHB demo reference are identified distinctly.

The frontend does not currently register a service worker or provide offline SOS delivery. SOS requires a reachable backend; the interface reports when the server cannot confirm an incident. Background location, offline dispatch, and push notifications are not provided.

## API overview

- `POST /api/v1/auth/register`
- `POST /api/v1/auth/login`
- `GET /api/v1/auth/me`
- `GET /api/v1/contacts`
- `POST /api/v1/contacts`
- `GET /api/v1/incidents`
- `POST /api/v1/incidents`
- `POST /api/v1/incidents/:id/alerts`
- `GET /api/v1/incidents/:id/alerts`
- `POST /api/v1/incidents/:id/classify`
- `POST /api/v1/webhooks/twilio/sms-status` (Twilio signature required)
- `GET /api/v1/services/nearby?lat=...&lng=...&category=hospital`
- `POST /api/v1/copilot/chat`
- `POST /api/v1/journeys`

## Security considerations

- Keep `.env` out of version control.
- Never expose API keys to the frontend.
- Validate all request payloads.
- Use secure, expiring tokens in production instead of demo tokens.
- Treat AI-generated output as advisory only.

## Demo workflow

1. Open the Safety Home page.
2. Tap **SOS** or describe a scenario.
3. Review nearby emergency services.
4. Use the AI copilot for a calm next-step summary.
5. Check the incident dashboard and contact status.
6. Use the Safety Journey page to simulate check-ins and arrivals.
