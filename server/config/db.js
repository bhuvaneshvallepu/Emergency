import mongoose from 'mongoose';

export async function connectDb() {
  const mongoUri = process.env.MONGODB_URI?.trim();
  const demoMode = process.env.DEMO_MODE === 'true';

  if (!mongoUri) {
    if (demoMode) {
      if (process.env.NODE_ENV === 'production') {
        throw new Error('MONGODB_URI is required in production; in-memory demo mode is not allowed.');
      }
      console.warn('DEMO_MODE enabled. Running with in-memory demo data only; records will not survive restart.');
      return false;
    }

    throw new Error('MONGODB_URI is required unless explicit local DEMO_MODE=true is configured.');
  }

  try {
    await mongoose.connect(mongoUri, {
      serverSelectionTimeoutMS: 5000,
    });
    await Promise.all(Object.values(mongoose.models).map((model) => model.createIndexes()));
    console.log('MongoDB connected successfully.');
    mongoose.connection.on('disconnected', () => {
      console.error('MongoDB connection lost; database-backed requests will fail until reconnection succeeds.');
    });
    mongoose.connection.on('reconnected', () => {
      console.info('MongoDB connection restored.');
    });
    return true;
  } catch (error) {
    const code = typeof error?.code === 'string' || typeof error?.code === 'number'
      ? ` (${error.code})`
      : '';
    console.error(`MongoDB connection or index setup failed${code}. Check the Atlas URI, database-user permissions, IP access list, and existing index conflicts.`);
    throw new Error('MongoDB setup failed; refusing to start without database persistence.', { cause: error });
  }
}
