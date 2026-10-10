# SafeSphere AI — Intelligent Emergency Contact & Assistance System

SafeSphere AI is an emergency assistance platform designed for rapid SOS workflows, nearby emergency service discovery, AI-assisted guidance, and trusted contact escalation.

## Prerequisites

- Node.js 18+
- npm 9+
- MongoDB connection string optional; the app runs in demo mode without it
- Optional OpenAI API key for AI classification and copilot responses
- Optional Places API key for live nearby service data

## Installation

1. Clone the project and install dependencies.
2. Copy `.env.example` to `.env` and fill in your provider credentials.
3. Start the app with:

```bash
npm run dev
```

## Environment setup

```env
PORT=5000
MONGODB_URI=
OPENAI_API_KEY=
PLACES_API_KEY=
SMS_ACCOUNT_ID=
SMS_AUTH_TOKEN=
SMS_FROM_NUMBER=
CLIENT_URL=http://localhost:5173
JWT_SECRET=change-me-in-production
```

## Demo mode

If API keys are not available, the application runs using seeded demo facilities and simulated alert flows. The UI clearly labels demo data and keeps the SOS workflow functional.

## Running the app

- Frontend: http://localhost:5173
- Backend: http://localhost:5000

## API overview

- `POST /api/v1/auth/register`
- `POST /api/v1/auth/login`
- `GET /api/v1/auth/me`
- `GET /api/v1/contacts`
- `POST /api/v1/contacts`
- `GET /api/v1/incidents`
- `POST /api/v1/incidents`
- `POST /api/v1/incidents/:id/classify`
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
