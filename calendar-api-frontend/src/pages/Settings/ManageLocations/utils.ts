async function getAllLocations() {
  try {
    const response = await fetch("/api/location/all", {
      method: "GET",
      mode: "cors",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
    });
    if (!response.ok) {
      throw new Error("Response was not ok");
    }
    return await response.json();
  } catch (error) {
    console.error("Error fetching locations:", error);
    return [];
  }
}

async function createLocation(name: string) {
  try {
    const response = await fetch("/api/location/new", {
      method: "POST",
      mode: "cors",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name }),
    });
    if (!response.ok) {
      throw new Error("Response was not ok");
    }
    return await response.json();
  } catch (error) {
    console.error("Error creating location:", error);
    return null;
  }
}

async function deleteLocation(id: string) {
  try {
    const response = await fetch(`/api/location/${id}`, {
      method: "DELETE",
      mode: "cors",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
    });
    if (!response.ok) {
      throw new Error("Response was not ok");
    }
    return await response.json();
  } catch (error) {
    console.error("Error deleting location:", error);
    return null;
  }
}

async function updateLocation(id: string, name: string) {
  try {
    const response = await fetch(`/api/location/${id}`, {
      method: "PUT",
      mode: "cors",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name }),
    });
    if (!response.ok) {
      throw new Error("Response was not ok");
    }
    return await response.json();
  } catch (error) {
    console.error("Error updating location:", error);
    return null;
  }
}

export default {
  getAllLocations,
  createLocation,
  deleteLocation,
  updateLocation,
};
