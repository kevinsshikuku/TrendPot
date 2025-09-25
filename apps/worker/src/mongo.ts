import mongoose from "mongoose";
import { workerLogger } from "./logger";

const MONGODB_URI = process.env.MONGODB_URI ?? "mongodb://localhost:27017/trendpot";

let connectionPromise: Promise<typeof mongoose> | null = null;

export const connectMongo = async (): Promise<typeof mongoose> => {
  if (mongoose.connection.readyState === 1) {
    return mongoose;
  }

  if (!connectionPromise) {
    mongoose.set("strictQuery", false);
    connectionPromise = mongoose
      .connect(MONGODB_URI, {
        serverSelectionTimeoutMS: 10_000
      })
      .catch((error) => {
        connectionPromise = null;
        workerLogger.error(
          { event: "mongo.connection_failed", message: (error as Error).message },
          "Failed to connect to MongoDB"
        );
        throw error;
      });
  }

  return connectionPromise;
};

export const getMongoDb = async () => {
  const connection = await connectMongo();
  return connection.connection.db;
};
