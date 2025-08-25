import mongoose from 'mongoose';

let isConnected = false;

export async function connectDB(uri) {
  if (isConnected) return mongoose.connection;
  if (!uri) throw new Error('MONGODB_URI is not set');
  mongoose.set('strictQuery', true);
  await mongoose.connect(uri, {
    // useNewUrlParser and useUnifiedTopology are default true in Mongoose v7+
    serverSelectionTimeoutMS: 10000,
  });
  isConnected = true;
  console.log('Connected to MongoDB');
  return mongoose.connection;
}

export default connectDB;
