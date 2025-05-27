import locationService from "../services/locationService.js";

async function createLocation(req, res) {
  const location = req.body;
  if (!location || !location.name) {
    return res.status(400).json({ error: "Location name is required" });
  }

  try {
    const location = await locationService.createLocation(req.body);

    res.status(201).json(location);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

async function getAllLocations(_req, res) {
  try {
    const locations = await locationService.getAllLocations();
    res.json(locations);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function getLocationById(req, res) {
  if (!req.params.id) {
    return res.status(400).json({ error: "Location ID is required" });
  }

  try {
    const location = await locationService.getLocationById(req.params.id);

    if (!location) {
      return res.status(404).json({ error: "Location not found" });
    }

    res.json(location);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function updateLocation(req, res) {
  if (!req.params.id) {
    return res.status(400).json({ error: "Location ID is required" });
  }
  if (!req.body || !req.body.name) {
    return res.status(400).json({ error: "Location name is required" });
  }
  if (req.body.assignedUsers && !Array.isArray(req.body.assignedUsers)) {
    return res.status(400).json({ error: "Assigned users must be an array" });
  }

  try {
    const updated = await locationService.updateLocation(
      req.params.id,
      req.body
    );

    if (!updated) {
      return res.status(404).json({ error: "Location not found" });
    }

    res.json(updated);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

async function deleteLocation(req, res) {
  if (!req.params.id) {
    return res.status(400).json({ error: "Location ID is required" });
  }

  try {
    const deleted = await locationService.deleteLocation(req.params.id);

    if (!deleted) {
      return res.status(404).json({ error: "Location not found" });
    }

    res.json({ message: "Location deleted" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

export default {
  createLocation,
  getAllLocations,
  getLocationById,
  updateLocation,
  deleteLocation,
};
