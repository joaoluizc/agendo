import express from "express";
import locationController from "../controllers/locationController.js";
import adminOnly from "../middlewares/adminOnly.js";

const locationRouter = express.Router();

// Locations are org-wide config, edited only from Settings › Manage locations, which
// renders behind `type === "admin"` (Settings.tsx). Mutations are therefore admin-only.
// Reads stay open to any authenticated user: `GET /all` feeds that same page and is
// harmless roster context, and gating it would risk breaking a read path for no gain.

/**
 * @openapi
 * /all:
 *   get:
 *     summary: Get all locations
 *     tags:
 *       - Locations
 *     responses:
 *       200:
 *         description: A list of locations
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   _id:
 *                     type: string
 *                   name:
 *                     type: string
 */
locationRouter.get("/all", locationController.getAllLocations);

/**
 * @openapi
 * /new:
 *   post:
 *     summary: Create a new location
 *     tags:
 *       - Locations
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               [otherProps]:
 *                 type: string
 *     responses:
 *       201:
 *         description: Location created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 _id:
 *                   type: string
 *                 name:
 *                   type: string
 *                 [otherProps]:
 *                   type: string
 */
locationRouter.post("/new", adminOnly, locationController.createLocation);

/**
 * @openapi
 * /{id}:
 *   get:
 *     summary: Get a location by ID
 *     tags:
 *       - Locations
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Location found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 _id:
 *                   type: string
 *                 name:
 *                   type: string
 *                 [otherProps]:
 *                   type: string
 *       404:
 *         description: Location not found
 */
locationRouter.get("/:id", locationController.getLocationById);

/**
 * @openapi
 * /{id}:
 *   put:
 *     summary: Update a location by ID
 *     tags:
 *       - Locations
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               [otherProps]:
 *                 type: string
 *     responses:
 *       200:
 *         description: Location updated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 _id:
 *                   type: string
 *                 name:
 *                   type: string
 *                 [otherProps]:
 *                   type: string
 *       404:
 *         description: Location not found
 */
locationRouter.put("/:id", adminOnly, locationController.updateLocation);

/**
 * @openapi
 * /{id}:
 *   delete:
 *     summary: Delete a location by ID
 *     tags:
 *       - Locations
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       204:
 *         description: Location deleted
 *       404:
 *         description: Location not found
 */
locationRouter.delete("/:id", adminOnly, locationController.deleteLocation);

/**
 * @openapi
 * /{id}/assigned-users:
 *   put:
 *     summary: Update assigned users for a location
 *     tags:
 *       - Locations
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               assignedUsers:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       200:
 *         description: Assigned users updated
 */

export default locationRouter;
