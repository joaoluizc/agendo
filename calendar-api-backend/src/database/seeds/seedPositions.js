import Position from '../../models/PositionModel.js';
import { allPositions } from './initialPositions.js';

const seedPositions = async () => {
  try {
    await Position.deleteMany({});
    await Position.insertMany(allPositions);
    console.log('Positions seeded successfully');
  } catch (error) {
    console.error('Error seeding positions:', error);
  }
};

export default seedPositions;
