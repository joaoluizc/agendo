import express from "express";
import skillController from "../controllers/skillController.js";
import adminOnly from "../middlewares/adminOnly.js";

const skillRouter = express.Router();

// Skills are a global taxonomy assigned to users (see `skills` on the User model), not
// per-user data — renaming or deleting one reaches every user holding it. No frontend
// code calls these mutations at all today (the only frontend reference to skills is the
// `skillTypes.ts` type), so they are admin-only config endpoints. Reads stay open.

/**
 * @openapi
 * /skills:
 *   get:
 *     summary: Get all skills
 *     tags:
 *       - Skills
 *     responses:
 *       200:
 *         description: A list of skills
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
 *       400:
 *         description: Bad request
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 */
skillRouter.get("/", skillController.getAllSkills);

/**
 * @openapi
 * /skills/{skillId}:
 *   get:
 *     summary: Get a skill by ID
 *     tags:
 *       - Skills
 *     parameters:
 *       - in: path
 *         name: skillId
 *         required: true
 *         schema:
 *           type: string
 *         description: The skill ID
 *     responses:
 *       200:
 *         description: Skill found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 _id:
 *                   type: string
 *                 name:
 *                   type: string
 *       400:
 *         description: Bad request
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *       404:
 *         description: Skill not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 */
skillRouter.get("/:skillId", skillController.getSkillById);

/**
 * @openapi
 * /skills:
 *   post:
 *     summary: Create a new skill
 *     tags:
 *       - Skills
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *             properties:
 *               name:
 *                 type: string
 *                 description: The name of the skill
 *                 example: "JavaScript"
 *     responses:
 *       201:
 *         description: Skill created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 _id:
 *                   type: string
 *                 name:
 *                   type: string
 *       400:
 *         description: Bad request
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *       409:
 *         description: Skill with this name already exists
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 */
skillRouter.post("/", adminOnly, skillController.createSkill);

/**
 * @openapi
 * /skills/{skillId}:
 *   put:
 *     summary: Update a skill
 *     tags:
 *       - Skills
 *     parameters:
 *       - in: path
 *         name: skillId
 *         required: true
 *         schema:
 *           type: string
 *         description: The skill ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *             properties:
 *               name:
 *                 type: string
 *                 description: The new name of the skill
 *                 example: "Advanced JavaScript"
 *     responses:
 *       200:
 *         description: Skill updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 _id:
 *                   type: string
 *                 name:
 *                   type: string
 *       400:
 *         description: Bad request
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *       404:
 *         description: Skill not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *       409:
 *         description: Skill with this name already exists
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 */
skillRouter.put("/:skillId", adminOnly, skillController.updateSkill);

/**
 * @openapi
 * /skills/{skillId}:
 *   delete:
 *     summary: Delete a skill
 *     tags:
 *       - Skills
 *     parameters:
 *       - in: path
 *         name: skillId
 *         required: true
 *         schema:
 *           type: string
 *         description: The skill ID
 *     responses:
 *       200:
 *         description: Skill deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *       400:
 *         description: Bad request
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *       404:
 *         description: Skill not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 */
skillRouter.delete("/:skillId", adminOnly, skillController.deleteSkill);

export default skillRouter;
