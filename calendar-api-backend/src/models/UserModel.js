import mongoose from 'mongoose'
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

// Define the User schema
const UserSchema = new mongoose.Schema({
  name: {
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
    required: true,
  },
  type: {
    type: String,
    enum: ['normal', 'admin', 'dev'],
    required: true,
  },
  date: {
    type: Date,
    default: Date.now,
  },
  gapitoken: {
    type: GapiTokenSchema,
    required: false,
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
