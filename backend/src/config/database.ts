import mongoose from 'mongoose';

class Database {
  private static instance: Database;
  private isConnected: boolean = false;

  private constructor() {}

  public static getInstance(): Database {
    if (!Database.instance) {
      Database.instance = new Database();
    }
    return Database.instance;
  }

  public async connect(): Promise<void> {
    if (this.isConnected) {
      console.log('✅ MongoDB is already connected');
      return;
    }

    try {
      const mongoUri =
        process.env.NODE_ENV === 'test' ? process.env.MONGODB_URI_TEST! : process.env.MONGODB_URI!;

      if (!mongoUri) {
        throw new Error('MongoDB URI is not defined in environment variables');
      }

      const conn = await mongoose.connect(mongoUri, {
        maxPoolSize: 10,
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000,
      });

      this.isConnected = true;
      console.log(`✅ MongoDB Connected: ${conn.connection.host}`);

      mongoose.connection.on('error', (err) => {
        console.error('❌ MongoDB connection error:', err);
      });

      mongoose.connection.on('disconnected', () => {
        console.warn('⚠️ MongoDB disconnected');
        this.isConnected = false;
      });

      mongoose.connection.on('reconnected', () => {
        console.log('✅ MongoDB reconnected');
        this.isConnected = true;
      });
    } catch (error) {
      console.error('❌ MongoDB connection failed:', error);
      process.exit(1);
    }
  }

  public async disconnect(): Promise<void> {
    if (!this.isConnected) return;
    await mongoose.disconnect();
    this.isConnected = false;
    console.log('✅ MongoDB disconnected gracefully');
  }
}

export default Database.getInstance();
