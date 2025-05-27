import Location from "../models/LocationModel.js";

async function createLocation(location) {
  const newLocation = new Location(location);
  return await newLocation.save();
}

async function getAllLocations() {
  return await Location.find();
}

async function getLocationById(id) {
  return await Location.findById(id);
}

async function updateLocation(id, location) {
  return await Location.findByIdAndUpdate(id, location, { new: true });
}

async function deleteLocation(id) {
  return await Location.findByIdAndDelete(id);
}

export default {
  createLocation,
  getAllLocations,
  getLocationById,
  updateLocation,
  deleteLocation,
};
