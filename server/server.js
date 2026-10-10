import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import rateLimit from 'express-rate-limit';
import { Server } from 'socket.io';
import dotenv from 'dotenv';
import { connectDb } from './config/db.js';
import authRoutes from './routes/authRoutes.js';
import contactsRoutes from './routes/contactsRoutes.js';
import incidentsRoutes from './routes/incidentsRoutes.js';
import servicesRoutes from './routes/servicesRoutes.js';
import copilotRoutes from './routes/copilotRoutes.js';
import journeysRoutes from './routes/journeysRoutes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

dotenv.config({ path: path.resolve(rootDir, '.env') });

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

app.use(helmet());
app.use(cors({ origin: process.env.CLIENT_URL || 'http://localhost:5173', credentials: true }));
app.use(express.json({ limit: '1mb' }));
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
  res.json({ status: 'ok', service: 'SafeSphere AI', mode: process.env.MONGODB_URI ? 'database' : 'demo' });
});

app.use('/api/v1/auth', authRoutes);
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
  socket.emit('system', { type: 'connected', message: 'Connected to SafeSphere AI live updates.' });

  socket.on('join-incident', (incidentId) => {
    socket.join(`incident-${incidentId}`);
  });
});

const PORT = Number(process.env.PORT) || 5000;

await connectDb();

server.listen(PORT, () => {
  console.log(`SafeSphere API running on http://localhost:${PORT}`);
});
