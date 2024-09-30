import mongoose from 'mongoose'
import { initialPositions } from '../database/seeds/initialPositions.js';
const { Schema } = mongoose;

const GapiTokenSchema = new Schema({
  access_token: {
    type: String,
    required: true,
  },
  refresh_token: {
    type: String,
    required: true,
  },
  scope: {
    type: String,
    required: true,
  },
  token_type: {
    type: String,
    required: true,
  },
  expiry_date: {
    type: Number,
    required: true,
  },
});

// Define what positions user wants to sync to google calendar
const PositionToSyncSchema = new Schema({
  positionId: {
    type: String,
    required: true,
  },
  sync: {
    type: Boolean,
    required: true,
    default: false,
  },
});

// Define the User schema
const UserSchema = new mongoose.Schema({
  firstName: {
    type: String,
    required: true,
  },
  lastName: {
    type: String,
    required: true,
  },
  email: {
    type: String,
    required: true,
    unique: true,
  },
  password: {
    type: String,
    required: false,
  },
  type: {
    type: String,
    enum: ['normal', 'admin'],
    required: true,
    default: 'normal',
  },
  timeZone: {
    type: Number,
    default: 0,
  },
  gapitoken: {
    type: GapiTokenSchema,
    required: false,
  },
  positionsToSync: {
    type: [PositionToSyncSchema],
    required: false,
    default: initialPositions,
  },
  slingId: {
    type: String,
    required: false,
  },
});

// Create the User model
const User = mongoose.model('User', UserSchema);

export {
    User
};
