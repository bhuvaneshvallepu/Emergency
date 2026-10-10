import express from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import User from '../models/User.js';
import { demoStore } from '../data/store.js';

const router = express.Router();

function signToken(payload) {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret === 'demo-secret') {
    throw new Error('JWT secret is not configured.');
  }
  return jwt.sign(payload, secret, { expiresIn: '7d' });
}

router.post('/register', async (req, res) => {
  const { name, email, password } = req.body || {};

  if (!name || !email || !password) {
    return res.status(400).json({ message: 'Name, email, and password are required.' });
  }

  if (password.length < 8) {
    return res.status(400).json({ message: 'Password must be at least 8 characters long.' });
  }

  const normalizedEmail = String(email).trim().toLowerCase();

  if (process.env.DEMO_MODE === 'true') {
    const existing = demoStore.user.email === normalizedEmail;
    if (existing) {
      return res.status(409).json({ message: 'User already exists.' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    demoStore.user = {
      ...demoStore.user,
      name,
      email: normalizedEmail,
      passwordHash,
    };

    const token = signToken({ id: demoStore.user.id, email: demoStore.user.email, name: demoStore.user.name });
    return res.status(201).json({ token, user: { ...demoStore.user, passwordHash: undefined } });
  }

  try {
    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) {
      return res.status(409).json({ message: 'User already exists.' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.create({
      name,
      email: normalizedEmail,
      passwordHash,
      preferredLanguage: 'en',
    });

    const token = signToken({ id: user._id.toString(), email: user.email, name: user.name });
    return res.status(201).json({ token, user: { id: user._id, name: user.name, email: user.email } });
  } catch (error) {
    return res.status(500).json({ message: 'Registration failed.' });
  }
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body || {};

  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required.' });
  }

  const normalizedEmail = String(email).trim().toLowerCase();

  if (process.env.DEMO_MODE === 'true') {
    const demoUser = demoStore.user;
    const matches = demoUser.email === normalizedEmail && (await bcrypt.compare(password, demoUser.passwordHash || '$2a$10$M8Ox3Q1C2T9E7m0sNKg2Cu7K1kQ6c0d8.8uPzM1QOhk72F6HhH7xO'));
    if (!matches) {
      return res.status(401).json({ message: 'Invalid credentials.' });
    }

    const token = signToken({ id: demoUser.id, email: demoUser.email, name: demoUser.name });
    return res.json({ token, user: { ...demoUser, passwordHash: undefined } });
  }

  try {
    const user = await User.findOne({ email: normalizedEmail });
    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials.' });
    }

    const matches = await bcrypt.compare(password, user.passwordHash || '');
    if (!matches) {
      return res.status(401).json({ message: 'Invalid credentials.' });
    }

    const token = signToken({ id: user._id.toString(), email: user.email, name: user.name });
    return res.json({ token, user: { id: user._id, name: user.name, email: user.email } });
  } catch (error) {
    return res.status(500).json({ message: 'Login failed.' });
  }
});

router.post('/logout', (_req, res) => {
  return res.json({ message: 'Logged out successfully. Clear the stored token from the client.' });
});

router.get('/me', async (req, res) => {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (process.env.DEMO_MODE === 'true' && token === 'demo-token') {
    return res.json({ user: { ...demoStore.user, passwordHash: undefined } });
  }

  if (!token) {
    return res.status(401).json({ message: 'Authentication required.' });
  }

  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret || jwtSecret === 'demo-secret') {
    return res.status(500).json({ message: 'JWT secret is not configured for this environment.' });
  }

  try {
    const decoded = jwt.verify(token, jwtSecret);
    const user = await User.findById(decoded.id).lean();
    if (!user) {
      return res.status(401).json({ message: 'User not found.' });
    }

    return res.json({ user: { id: user._id, name: user.name, email: user.email } });
  } catch (error) {
    return res.status(401).json({ message: 'Invalid or expired token.' });
  }
});

export default router;
