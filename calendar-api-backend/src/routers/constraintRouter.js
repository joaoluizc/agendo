import express from "express";
import {
  validateSchedule,
  validateShift,
  getConstraintMetrics,
  getAvailableUsers,
} from "../controllers/constraintController.js";
import { requireAuth } from "@clerk/express";
import adminOnly from "../middlewares/adminOnly.js";

const router = express.Router();

/**
 * @swagger
 * components:
 *   schemas:
 *     ConstraintViolation:
 *       type: object
 *       properties:
 *         type:
 *           type: string
 *           enum: [AVAILABILITY, SKILLS, TIME_LIMITS, ACTIVITY_RULES, CONFLICTS, COVERAGE]
 *         message:
 *           type: string
 *         data:
 *           type: object
 *         timestamp:
 *           type: string
 *           format: date-time
 *
 *     ConstraintMetrics:
 *       type: object
 *       properties:
 *         totalShifts:
 *           type: number
 *         totalUsers:
 *           type: number
 *         totalPositions:
 *           type: number
 *         coverageScore:
 *           type: number
 *         skillMatchScore:
 *           type: number
 *         availabilityScore:
 *           type: number
 *
 *     ConstraintSuggestion:
 *       type: object
 *       properties:
 *         type:
 *           type: string
 *         message:
 *           type: string
 *         count:
 *           type: number
 *
 *     ConstraintValidationResult:
 *       type: object
 *       properties:
 *         ok:
 *           type: boolean
 *         violations:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/ConstraintViolation'
 *         metrics:
 *           $ref: '#/components/schemas/ConstraintMetrics'
 *         suggestions:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/ConstraintSuggestion'
 */

/**
 * @swagger
 * /api/constraints/validate:
 *   post:
 *     summary: Validate a complete schedule against all constraints
 *     tags: [Constraints]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - shifts
 *               - dateRange
 *             properties:
 *               shifts:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     userId:
 *                       type: string
 *                     positionId:
 *                       type: string
 *                     startTime:
 *                       type: string
 *                       format: date-time
 *                     endTime:
 *                       type: string
 *                       format: date-time
 *               dateRange:
 *                 type: object
 *                 properties:
 *                   start:
 *                     type: string
 *                     format: date-time
 *                   end:
 *                     type: string
 *                     format: date-time
 *     responses:
 *       200:
 *         description: Schedule validation result
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ConstraintValidationResult'
 *       400:
 *         description: Bad request
 *       500:
 *         description: Internal server error
 */
router.post("/validate", requireAuth(), adminOnly, validateSchedule);

/**
 * @swagger
 * /api/constraints/validate-shift:
 *   post:
 *     summary: Validate a single shift against constraints
 *     tags: [Constraints]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - shift
 *               - userId
 *               - positionId
 *             properties:
 *               shift:
 *                 type: object
 *                 properties:
 *                   startTime:
 *                     type: string
 *                     format: date-time
 *                   endTime:
 *                     type: string
 *                     format: date-time
 *               userId:
 *                 type: string
 *               positionId:
 *                 type: string
 *     responses:
 *       200:
 *         description: Shift validation result
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ConstraintValidationResult'
 *       400:
 *         description: Bad request
 *       404:
 *         description: User or position not found
 *       500:
 *         description: Internal server error
 */
router.post("/validate-shift", requireAuth(), validateShift);

/**
 * @swagger
 * /api/constraints/metrics:
 *   get:
 *     summary: Get constraint validation metrics for a date range
 *     tags: [Constraints]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: start
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *         description: Start date (YYYY-MM-DD)
 *       - in: query
 *         name: end
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *         description: End date (YYYY-MM-DD)
 *     responses:
 *       200:
 *         description: Constraint metrics for the date range
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ConstraintValidationResult'
 *       400:
 *         description: Bad request
 *       500:
 *         description: Internal server error
 */
router.get("/metrics", requireAuth(), getConstraintMetrics);

/**
 * @swagger
 * /api/constraints/available-users:
 *   get:
 *     summary: Get users available for a specific time slot and position
 *     tags: [Constraints]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: start
 *         required: true
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Start time (ISO 8601)
 *       - in: query
 *         name: end
 *         required: true
 *         schema:
 *           type: string
 *           format: date-time
 *         description: End time (ISO 8601)
 *       - in: query
 *         name: positionId
 *         required: true
 *         schema:
 *           type: string
 *         description: Position ID
 *     responses:
 *       200:
 *         description: List of available users
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 availableUsers:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       _id:
 *                         type: string
 *                       firstName:
 *                         type: string
 *                       lastName:
 *                         type: string
 *                       email:
 *                         type: string
 *                       skills:
 *                         type: array
 *                         items:
 *                           type: object
 *                           properties:
 *                             _id:
 *                               type: string
 *                             name:
 *                               type: string
 *                 position:
 *                   type: object
 *                   properties:
 *                     _id:
 *                       type: string
 *                     name:
 *                       type: string
 *                     requiredSkills:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           _id:
 *                             type: string
 *                           name:
 *                             type: string
 *                 timeSlot:
 *                   type: object
 *                   properties:
 *                     start:
 *                       type: string
 *                       format: date-time
 *                     end:
 *                       type: string
 *                       format: date-time
 *       400:
 *         description: Bad request
 *       404:
 *         description: Position not found
 *       500:
 *         description: Internal server error
 */
router.get("/available-users", requireAuth(), getAvailableUsers);

export default router;
