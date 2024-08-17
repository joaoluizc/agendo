import mongoose from 'mongoose'
const { Schema } = mongoose;

const PositionSchema = new Schema({
  positionId: {
    type: String,
    auto: true,
  },
  name: {
    type: String,
    required: true,
  },
  color: {
    type: String,
    required: true,
  },
  type: {
    type: String,
    required: true,
    default: 'ticket',
  },
});

const Position = mongoose.model('Position', PositionSchema);

export default Position;