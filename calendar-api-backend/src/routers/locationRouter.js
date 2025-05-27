import express from "express";
import locationController from "../controllers/locationController.js";

const locationRouter = express.Router();

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
locationRouter.post("/new", locationController.createLocation);

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
locationRouter.put("/:id", locationController.updateLocation);

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
locationRouter.delete("/:id", locationController.deleteLocation);

export default locationRouter;
