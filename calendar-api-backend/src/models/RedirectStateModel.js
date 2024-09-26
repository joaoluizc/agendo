import mongoose from 'mongoose'
const { Schema } = mongoose;

const RedirectStateSchema = new Schema({
  stateId: {
    type: String,
    auto: true,
  },
  state: {
    type: String,
    required: true,
  },
  userEmail: {
    type: String,
    required: true,
  },
});

const RedirectState = mongoose.model('RedirectState', RedirectStateSchema);

export default RedirectState;