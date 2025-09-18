import constraintEngine from "../services/constraintEngineService.js";
import { User } from "../models/UserModel.js";
import Position from "../models/PositionModel.js";
import Shift from "../models/ShiftModel.js";
import DemandForecast from "../models/DemandForecastModel.js";

/**
 * Controller for constraint validation operations
 */

/**
 * Validate a schedule against all constraints
 * POST /api/constraints/validate
 */
export async function validateSchedule(req, res) {
  try {
    const { shifts, dateRange } = req.body;

    if (!shifts || !Array.isArray(shifts)) {
      return res.status(400).json({
        message: "Shifts array is required",
      });
    }

    if (!dateRange || !dateRange.start || !dateRange.end) {
      return res.status(400).json({
        message: "Date range with start and end is required",
      });
    }

    // Fetch required data
    const [users, positions, forecasts] = await Promise.all([
      User.find({}).populate("skills"),
      Position.find({}).populate("requiredSkills"),
      DemandForecast.find({
        date: {
          $gte: new Date(dateRange.start),
          $lte: new Date(dateRange.end),
        },
      }),
    ]);

    // Validate the schedule
    const result = await constraintEngine.validateSchedule({
      shifts,
      users,
      positions,
      forecasts,
      dateRange: {
        start: new Date(dateRange.start),
        end: new Date(dateRange.end),
      },
    });

    res.json(result);
  } catch (error) {
    console.error(`[${req.requestId}] Error validating schedule:`, error);
    res.status(500).json({
      message: "Internal server error during validation",
      error: error.message,
    });
  }
}

/**
 * Validate a single shift against constraints
 * POST /api/constraints/validate-shift
 */
export async function validateShift(req, res) {
  try {
    const { shift, userId, positionId } = req.body;

    if (!shift || !userId || !positionId) {
      return res.status(400).json({
        message: "Shift, userId, and positionId are required",
      });
    }

    // Fetch user and position data
    const [user, position] = await Promise.all([
      User.findById(userId).populate("skills"),
      Position.findById(positionId).populate("requiredSkills"),
    ]);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (!position) {
      return res.status(404).json({ message: "Position not found" });
    }

    // Create a single-shift schedule for validation
    const singleShift = {
      ...shift,
      userId,
      positionId,
    };

    const result = await constraintEngine.validateSchedule({
      shifts: [singleShift],
      users: [user],
      positions: [position],
      forecasts: [], // No forecast needed for single shift
      dateRange: {
        start: new Date(shift.startTime),
        end: new Date(shift.endTime),
      },
    });

    res.json(result);
  } catch (error) {
    console.error(`[${req.requestId}] Error validating shift:`, error);
    res.status(500).json({
      message: "Internal server error during shift validation",
      error: error.message,
    });
  }
}

/**
 * Get constraint validation metrics for a date range
 * GET /api/constraints/metrics?start=2024-01-01&end=2024-01-07
 */
export async function getConstraintMetrics(req, res) {
  try {
    const { start, end } = req.query;

    if (!start || !end) {
      return res.status(400).json({
        message: "Start and end dates are required",
      });
    }

    const startDate = new Date(start);
    const endDate = new Date(end);

    // Fetch shifts in date range
    const shifts = await Shift.find({
      startTime: { $gte: startDate },
      endTime: { $lte: endDate },
    });

    if (shifts.length === 0) {
      return res.json({
        ok: true,
        violations: [],
        metrics: {
          totalShifts: 0,
          totalUsers: 0,
          totalPositions: 0,
          coverageScore: 100,
          skillMatchScore: 100,
          availabilityScore: 100,
        },
        suggestions: [],
      });
    }

    // Fetch required data
    const [users, positions, forecasts] = await Promise.all([
      User.find({}).populate("skills"),
      Position.find({}).populate("requiredSkills"),
      DemandForecast.find({
        date: { $gte: startDate, $lte: endDate },
      }),
    ]);

    // Validate the schedule
    const result = await constraintEngine.validateSchedule({
      shifts,
      users,
      positions,
      forecasts,
      dateRange: { start: startDate, end: endDate },
    });

    res.json(result);
  } catch (error) {
    console.error(
      `[${req.requestId}] Error getting constraint metrics:`,
      error
    );
    res.status(500).json({
      message: "Internal server error getting metrics",
      error: error.message,
    });
  }
}

/**
 * Get available users for a specific time slot and position
 * GET /api/constraints/available-users?start=2024-01-01T09:00:00Z&end=2024-01-01T17:00:00Z&positionId=123
 */
export async function getAvailableUsers(req, res) {
  try {
    const { start, end, positionId } = req.query;

    if (!start || !end || !positionId) {
      return res.status(400).json({
        message: "Start time, end time, and positionId are required",
      });
    }

    const startTime = new Date(start);
    const endTime = new Date(end);

    // Fetch position and all users
    const [position, users] = await Promise.all([
      Position.findById(positionId).populate("requiredSkills"),
      User.find({}).populate("skills"),
    ]);

    if (!position) {
      return res.status(404).json({ message: "Position not found" });
    }

    // Check each user's availability
    const availableUsers = [];

    for (const user of users) {
      // Check if user has required skills
      const userSkills = user.skills.map((s) => s._id.toString());
      const requiredSkills = position.requiredSkills.map((s) =>
        s._id.toString()
      );
      const hasRequiredSkills = requiredSkills.every((skill) =>
        userSkills.includes(skill)
      );

      if (!hasRequiredSkills) continue;

      // Check work hours
      const dayOfWeek = startTime.getDay();
      const workDay = user.workHours.find((wh) => wh.dayOfWeek === dayOfWeek);

      if (!workDay || !workDay.isWorking) continue;

      const shiftStartMinutes =
        startTime.getHours() * 60 + startTime.getMinutes();
      const shiftEndMinutes = endTime.getHours() * 60 + endTime.getMinutes();

      if (
        shiftStartMinutes < workDay.startMinute ||
        shiftEndMinutes > workDay.endMinute
      ) {
        continue;
      }

      // Check for existing shifts (simplified - in real implementation, check GCal too)
      const existingShifts = await Shift.find({
        userId: user._id,
        $or: [
          {
            startTime: { $lt: endTime },
            endTime: { $gt: startTime },
          },
        ],
      });

      if (existingShifts.length > 0) continue;

      availableUsers.push({
        _id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        skills: user.skills.map((s) => ({ _id: s._id, name: s.name })),
      });
    }

    res.json({
      availableUsers,
      position: {
        _id: position._id,
        name: position.name,
        requiredSkills: position.requiredSkills.map((s) => ({
          _id: s._id,
          name: s.name,
        })),
      },
      timeSlot: { start: startTime, end: endTime },
    });
  } catch (error) {
    console.error(`[${req.requestId}] Error getting available users:`, error);
    res.status(500).json({
      message: "Internal server error getting available users",
      error: error.message,
    });
  }
}
