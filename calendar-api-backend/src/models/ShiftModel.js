import mongoose from 'mongoose';
const Schema = mongoose.Schema;

// const iso8601Regex = /^(\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])[T\s](0[0-9]|1[0-9]|2[0-3]):[0-5]\d:[0-5]\d(\.\d+)?(Z|([+-](0[0-9]|1[0-2]):00)))$/;

const ShiftSchema = new Schema({
  shiftId: {
    type: Schema.Types.ObjectId,
    auto: true,
  },
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  startTime: {
    type: Date,
    required: true,
  },
  endTime: {
    type: Date,
    required: true,
  },
  positionId: {
    type: Schema.Types.ObjectId,
    ref: 'Position'
  }
});

const Shift = mongoose.model('Shift', ShiftSchema);
module.exports = Shift;
