import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import { demoStore } from '../data/store.js';
import { isDemoMode, databaseUnavailable, isDatabaseReady } from '../config/persistence.js';

export async function authenticate(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (isDemoMode() && token === 'demo-token') {
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
    if (!isDatabaseReady()) {
      if (isDemoMode()) {
        req.user = decoded;
        return next();
      }
      return databaseUnavailable(res);
    }
    const user = await User.findById(decoded.id).select('_id name email').lean();
    if (!user) return res.status(401).json({ message: 'User not found.' });
    req.user = { id: String(user._id), email: user.email, name: user.name };
    return next();
  } catch (error) {
    if (!isDatabaseReady() && !isDemoMode()) return databaseUnavailable(res);
    return res.status(401).json({ message: 'Invalid or expired token.' });
  }
}
