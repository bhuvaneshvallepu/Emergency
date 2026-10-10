import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import rateLimit from 'express-rate-limit';
import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { connectDb } from './config/db.js';
import Incident from './models/Incident.js';
import { demoStore } from './data/store.js';
import { databaseUnavailable, isDemoMode, isObjectId } from './config/persistence.js';
import authRoutes from './routes/authRoutes.js';
import contactsRoutes from './routes/contactsRoutes.js';
import incidentsRoutes from './routes/incidentsRoutes.js';
import servicesRoutes from './routes/servicesRoutes.js';
import copilotRoutes from './routes/copilotRoutes.js';
import journeysRoutes from './routes/journeysRoutes.js';
import smsWebhookRoutes from './routes/smsWebhookRoutes.js';
import { setSocketServer } from './services/notificationService.js';
import { getSmsConfigurationStatus } from './services/smsProvider.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

dotenv.config({ path: path.resolve(rootDir, '.env') });

const smsConfiguration = getSmsConfigurationStatus();
console.info(`SMS provider configured: ${smsConfiguration.providerConfigured}`);
console.info(`SMS enabled: ${smsConfiguration.smsEnabled}`);
console.info(`Account SID configured: ${smsConfiguration.accountSidConfigured}`);
console.info(`Auth token configured: ${smsConfiguration.authTokenConfigured}`);
console.info(`Sender number configured: ${smsConfiguration.senderNumberConfigured}`);

if (process.env.NODE_ENV === 'production' && (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32)) {
  throw new Error('JWT_SECRET must be set to a strong value in production.');
}

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_URL || 'http://localhost:5173',
    methods: ['GET', 'POST'],
  },
});
setSocketServer(io);

function getSocketToken(socket) {
  const authToken = socket.handshake.auth?.token;
  const headerToken = socket.handshake.headers.authorization || '';
  if (typeof authToken === 'string' && authToken.trim()) return authToken.trim();
  if (typeof headerToken === 'string' && headerToken.startsWith('Bearer ')) return headerToken.slice(7).trim();
  return null;
}

async function canAccessIncident(user, incidentId) {
  if (!user || !incidentId) return false;
  if (isDemoMode()) {
    return demoStore.incidents.some((item) => item.id === incidentId && item.userId === user.id);
  }
  if (!isObjectId(incidentId)) return false;
  return Boolean(await Incident.exists({ _id: incidentId, userId: user.id }));
}

app.use(helmet());
app.use(cors({ origin: process.env.CLIENT_URL || 'http://localhost:5173', credentials: true }));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false, limit: '16kb' }));
app.use(morgan('dev'));
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 200,
    standardHeaders: true,
    legacyHeaders: false,
  }),
);

app.get('/api/v1/health', (_req, res) => {
  const demoMode = isDemoMode();
  const databaseReady = mongoose.connection.readyState === 1;
  if (!demoMode && !databaseReady) return databaseUnavailable(res);
  return res.json({ status: 'ok', service: 'SafeSphere AI', mode: demoMode ? 'demo' : 'database' });
});

app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/webhooks', smsWebhookRoutes);
app.use('/api/v1/contacts', contactsRoutes);
app.use('/api/v1/incidents', incidentsRoutes);
app.use('/api/v1/services', servicesRoutes);
app.use('/api/v1/copilot', copilotRoutes);
app.use('/api/v1/journeys', journeysRoutes);

app.use((err, _req, res, _next) => {
  console.error('Unhandled server error:', err.message);
  res.status(500).json({ message: 'Something went wrong on the server.' });
});

io.on('connection', (socket) => {
  const token = getSocketToken(socket);

  if (!token) {
    socket.emit('error', { type: 'auth_required', message: 'Authentication required for incident updates.' });
    socket.disconnect(true);
    return;
  }

  try {
    if (isDemoMode() && token === 'demo-token') {
      socket.data.user = demoStore.user;
    } else {
      const jwtSecret = process.env.JWT_SECRET;
      if (!jwtSecret || jwtSecret === 'demo-secret') {
        throw new Error('JWT secret is not configured.');
      }
      socket.data.user = jwt.verify(token, jwtSecret);
    }
  } catch (_error) {
    socket.emit('error', { type: 'invalid_token', message: 'Invalid or expired token.' });
    socket.disconnect(true);
    return;
  }

  socket.emit('system', { type: 'connected', message: 'Connected to SafeSphere AI live updates.' });

  socket.on('join-incident', async (incidentId) => {
    try {
      if (typeof incidentId !== 'string' || !await canAccessIncident(socket.data.user, incidentId)) {
        socket.emit('error', { type: 'unauthorized_room', message: 'You do not have access to that incident.' });
        return;
      }
      socket.join(`incident-${incidentId}`);
      socket.emit('incident-room-joined', { incidentId });
    } catch (error) {
      console.error('Socket incident access check failed:', error.name || 'database_error');
      socket.emit('error', { type: 'unauthorized_room', message: 'You do not have access to that incident.' });
    }
  });

  socket.on('leave-incident', (incidentId) => {
    if (typeof incidentId === 'string') {
      socket.leave(`incident-${incidentId}`);
    }
  });
});

const PORT = Number(process.env.PORT) || 5000;

await connectDb();

server.listen(PORT, () => {
  console.log(`SafeSphere API running on http://localhost:${PORT}`);
});
