import mongoose from 'mongoose';

export function isDatabaseReady() {
  return mongoose.connection.readyState === 1;
}

export function isDemoMode() {
  return process.env.DEMO_MODE === 'true'
    && !process.env.MONGODB_URI?.trim()
    && !isDatabaseReady();
}

export function databaseUnavailable(res) {
  return res.status(503).json({
    message: 'Database is unavailable. The request was not saved; retry after MongoDB reconnects.',
  });
}

export function handlePersistenceError(res, error, operation) {
  console.error(`${operation} failed:`, error?.name || 'database_error');
  if (!isDemoMode() && !isDatabaseReady()) return databaseUnavailable(res);
  return res.status(500).json({ message: `${operation} failed; no success was confirmed.` });
}

export function isObjectId(value) {
  return mongoose.isValidObjectId(value);
}
