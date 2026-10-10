import mongoose from 'mongoose';

export async function connectDb() {
  const mongoUri = process.env.MONGODB_URI;
  const demoMode = process.env.DEMO_MODE === 'true';

  if (!mongoUri) {
    if (demoMode) {
      console.log('DEMO_MODE enabled. Running with in-memory demo data only.');
      return false;
    }

    console.warn('MONGODB_URI is not configured. Demo mode is disabled. Start with DEMO_MODE=true or provide a MongoDB URI.');
    return false;
  }

  try {
    await mongoose.connect(mongoUri, {
      serverSelectionTimeoutMS: 5000,
    });
    console.log('MongoDB connected successfully.');
    return true;
  } catch (error) {
    console.error('MongoDB connection failed. The app cannot safely continue in production without a working database.', error.message);
    throw error;
  }
}
