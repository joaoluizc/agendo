import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Position from '../models/PositionModel';
import { initialPositions } from './initialPositions';

dotenv.config();

mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
});

const seedPositions = async () => {
  try {
    // Clear existing data
    await Position.deleteMany({});

    await Position.insertMany(initialPositions);
    console.log('Positions seeded successfully');
  } catch (error) {
    console.error('Error seeding positions:', error);
  } finally {
    mongoose.connection.close();
  }
};

seedPositions();
