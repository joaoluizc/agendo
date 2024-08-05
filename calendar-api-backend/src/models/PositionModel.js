import mongoose from 'mongoose'
const { Schema } = mongoose;

const PositionSchema = new Schema({
  positionId: {
    type: Schema.Types.ObjectId,
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
});

const Position = mongoose.model('Position', PositionSchema);

export default {
    Position
}