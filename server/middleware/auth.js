import jwt from 'jsonwebtoken';
import { demoStore } from '../data/store.js';

export function authenticate(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (process.env.DEMO_MODE === 'true' && token === 'demo-token') {
    req.user = demoStore.user;
    return next();
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
    req.user = decoded;
    return next();
  } catch (error) {
    return res.status(401).json({ message: 'Invalid or expired token.' });
  }
}
