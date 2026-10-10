import express from 'express';
import jwt from 'jsonwebtoken';
import { demoStore } from '../data/store.js';

const router = express.Router();

function signToken(payload) {
  return jwt.sign(payload, process.env.JWT_SECRET || 'demo-secret', { expiresIn: '7d' });
}

router.post('/register', (req, res) => {
  const { name, email, password } = req.body || {};

  if (!name || !email || !password) {
    return res.status(400).json({ message: 'Name, email, and password are required.' });
  }

  const existing = demoStore.user.email === email;
  if (existing) {
    return res.status(409).json({ message: 'User already exists.' });
  }

  demoStore.user = {
    ...demoStore.user,
    name,
    email,
    passwordHash: password,
  };

  const token = signToken({ id: demoStore.user.id, email: demoStore.user.email, name: demoStore.user.name });
  return res.status(201).json({ token, user: demoStore.user });
});

router.post('/login', (req, res) => {
  const { email, password } = req.body || {};

  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required.' });
  }

  if (demoStore.user.email === email && (demoStore.user.passwordHash || password)) {
    const token = signToken({ id: demoStore.user.id, email: demoStore.user.email, name: demoStore.user.name });
    return res.json({ token, user: demoStore.user });
  }

  return res.status(401).json({ message: 'Invalid credentials.' });
});

router.post('/logout', (_req, res) => {
  return res.json({ message: 'Logged out successfully.' });
});

router.get('/me', (req, res) => {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (token === 'demo-token' || token) {
    return res.json({ user: demoStore.user });
  }

  return res.status(401).json({ message: 'Authentication required.' });
});

export default router;
