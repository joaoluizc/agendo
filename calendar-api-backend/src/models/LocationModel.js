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
});

const Location = mongoose.model("Location", LocationSchema);

export default Location;
