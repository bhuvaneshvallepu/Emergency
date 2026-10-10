import mongoose from 'mongoose';

export async function connectDb() {
  const mongoUri = process.env.MONGODB_URI;

  if (!mongoUri) {
    console.log('MongoDB URI not set. Running in demo mode with in-memory demo data.');
    return false;
  }

  try {
    await mongoose.connect(mongoUri, {
      serverSelectionTimeoutMS: 5000,
    });
    console.log('MongoDB connected successfully.');
    return true;
  } catch (error) {
    console.warn('MongoDB connection failed. Falling back to demo mode.', error.message);
    return false;
  }
}
