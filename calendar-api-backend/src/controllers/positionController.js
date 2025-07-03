import positionService from "../services/positionService.js";
import userService from "../services/userService.js";
import { clerkClient } from "@clerk/express";
import slingController from "./slingController.js";

const getAllPositions = async (req, res) => {
  try {
    const positions = await positionService.getPositions();
    res.status(200).json(positions);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

const createPosition = async (req, res) => {
  const positionData = req.body;
  if (!positionData) {
    return res.status(400).json({ message: "Position data is required" });
  }
  if (!positionData.name) {
    return res.status(400).json({ message: "Position name is required" });
  }
  if (!positionData.color) {
    return res.status(400).json({ message: "Position color is required" });
  }
  try {
    const position = await positionService.createPosition(positionData);
    res.status(201).json(position);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
  slingController.updatePositions();
};

const updatePosition = async (req, res) => {
  const id = req.params.positionId;
  const positionData = req.body;
  if (!id) {
    return res.status(400).json({ message: "Position ID is required" });
  }
  if (!positionData) {
    return res.status(400).json({ message: "Position data is required" });
  }
  if (!positionData.name) {
    return res.status(400).json({ message: "Position name is required" });
  }
  if (!positionData.color) {
    return res.status(400).json({ message: "Position color is required" });
  }
  if (!positionData.type) {
    return res.status(400).json({ message: "Position type is required" });
  }
  if (!positionData.positionId) {
    positionData.positionId = "";
  }
  try {
    const position = await positionService.updatePosition(id, positionData);
    res.status(200).json(position);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
  slingController.updatePositions();
};

const getUserPositionsToSync = async (req, res) => {
  try {
    const positions = await positionService.getUserPositionsToSync(
      req.auth.userId
    );
    res.status(200).json(positions);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// const getUserPositionsToSync_cl = async (req, res) => {
//   try {
//     const user = await userService.findUser_cl(req.auth.userId);
//     const positionsToSync = user.publicMetadata.positionsToSync;
//     res.status(200).json(positionsToSync);
//   } catch (error) {
//     res.status(400).json({ message: error.message });
//   }
// };

const setUserPositionsToSync = async (req, res) => {
  const positions = req.body;
  if (!positions) {
    return res.status(400).json({ message: "Positions are required" });
  }
  try {
    await positionService.setUserPositionsToSync(req.auth.userId, positions);
    res.status(200).json({ message: "Positions updated" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// const setUserPositionsToSync_cl = async (req, res) => {
//   const userId = req.auth.userId;
//   const positions = req.body;
//   if (!positions) {
//     return res.status(400).json({ message: "Positions are required" });
//   }
//   try {
//     await clerkClient.users.updateUserMetadata(userId, {
//       publicMetadata: {
//         positionsToSync: positions,
//       },
//     });
//     res.status(200).json({ message: "Positions updated" });
//   } catch (err) {
//     console.error(
//       "Error syncing initial positions to sync to new user: ",
//       err.message
//     );
//     res.status(500).json({ message: err.message });
//   }
// };

async function getPosition(req, res) {
  const positionId = req.params.positionId;
  try {
    const position = await positionService.getPositionById(positionId);
    res.status(200).json(position);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
}

async function deletePosition(req, res) {
  const positionId = req.params.positionId;
  try {
    const position = await positionService.deletePosition(positionId);
    if (!position) {
      return res.status(404).json({ message: "Position not found" });
    }
    res.status(200).json({ message: "Position deleted successfully" });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
  slingController.updatePositions();
}

export default {
  createPosition,
  updatePosition,
  getUserPositionsToSync,
  // getUserPositionsToSync_cl,
  getAllPositions,
  setUserPositionsToSync,
  // setUserPositionsToSync_cl,
  getPosition,
  deletePosition,
};
