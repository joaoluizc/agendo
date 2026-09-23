import mongoose from "mongoose";
const { Schema } = mongoose;

const LocationSchema = new Schema({
  locationId: {
    type: String,
    auto: true,
  },
  name: {
    type: String,
    required: true,
  },
  assignedUsers: {
    type: [String],
    default: [],
  },
});

// Isolated in development, like users and coverage meters. `assignedUsers` holds clerk ids,
// and a local run's roster is `dev-users` — so assigning anyone to a location from a local
// run used to write dev (or test) ids into the production documents. Seed the dev copy with
// src/database/scripts/seedTestAgents.js.
const isDev = process.env.NODE_ENV === "development";
const collectionName = isDev ? "dev-locations" : "locations";

const Location = mongoose.model("Location", LocationSchema, collectionName);

export default Location;
