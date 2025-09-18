import { User } from "../models/UserModel.js";
import Position from "../models/PositionModel.js";
import Shift from "../models/ShiftModel.js";
import DemandForecast from "../models/DemandForecastModel.js";
import gCalendarService from "./gCalendarService.js";

/**
 * Constraint Engine for Schedule Validation
 * Validates schedules against hard rules and business constraints
 */

class ConstraintEngine {
  constructor() {
    this.violations = [];
    this.metrics = {
      totalShifts: 0,
      totalUsers: 0,
      totalPositions: 0,
      coverageScore: 0,
      skillMatchScore: 0,
      availabilityScore: 0,
    };
  }

  /**
   * Main validation method
   * @param {Object} params - Validation parameters
   * @param {Array} params.shifts - Array of shifts to validate
   * @param {Array} params.users - Array of users
   * @param {Array} params.positions - Array of positions
   * @param {Array} params.forecasts - Array of demand forecasts
   * @param {Object} params.dateRange - { start: Date, end: Date }
   * @returns {Object} Validation result
   */
  async validateSchedule({ shifts, users, positions, forecasts, dateRange }) {
    this.violations = [];
    this.metrics = {
      totalShifts: shifts.length,
      totalUsers: users.length,
      totalPositions: positions.length,
      coverageScore: 0,
      skillMatchScore: 0,
      availabilityScore: 0,
    };

    // Validate each constraint type
    await this.validateAvailability(shifts, users, dateRange);
    await this.validateSkills(shifts, users, positions);
    await this.validateTimeLimits(shifts, users);
    await this.validateActivityRules(shifts, positions);
    await this.validateConflicts(shifts);
    await this.validateCoverage(shifts, forecasts, positions);

    // Calculate overall scores
    this.calculateMetrics();

    return {
      ok: this.violations.length === 0,
      violations: this.violations,
      metrics: this.metrics,
      suggestions: this.generateSuggestions(),
    };
  }

  /**
   * Validate user availability (work hours + GCal conflicts)
   */
  async validateAvailability(shifts, users, dateRange) {
    const userMap = new Map(users.map((u) => [u._id.toString(), u]));

    for (const shift of shifts) {
      const user = userMap.get(shift.userId);
      if (!user) {
        this.addViolation(
          "AVAILABILITY",
          `User ${shift.userId} not found`,
          shift
        );
        continue;
      }

      // Check work hours
      const workHoursViolation = this.checkWorkHours(shift, user);
      if (workHoursViolation) {
        this.addViolation("AVAILABILITY", workHoursViolation, shift);
      }

      // Check GCal conflicts
      try {
        const gcalConflicts = await this.checkGCalConflicts(shift, user);
        if (gcalConflicts.length > 0) {
          this.addViolation(
            "AVAILABILITY",
            `Google Calendar conflicts: ${gcalConflicts.join(", ")}`,
            shift
          );
        }
      } catch (error) {
        console.warn(
          `Failed to check GCal conflicts for shift ${shift._id}:`,
          error.message
        );
      }
    }
  }

  /**
   * Check if shift falls within user's work hours
   */
  checkWorkHours(shift, user) {
    const shiftStart = new Date(shift.startTime);
    const shiftEnd = new Date(shift.endTime);
    const dayOfWeek = shiftStart.getDay();

    const workDay = user.workHours.find((wh) => wh.dayOfWeek === dayOfWeek);

    if (!workDay || !workDay.isWorking) {
      return `Shift scheduled on non-working day (${this.getDayName(
        dayOfWeek
      )})`;
    }

    const shiftStartMinutes =
      shiftStart.getHours() * 60 + shiftStart.getMinutes();
    const shiftEndMinutes = shiftEnd.getHours() * 60 + shiftEnd.getMinutes();

    if (
      shiftStartMinutes < workDay.startMinute ||
      shiftEndMinutes > workDay.endMinute
    ) {
      return `Shift outside work hours (${this.formatMinutes(
        workDay.startMinute
      )}-${this.formatMinutes(workDay.endMinute)})`;
    }

    return null;
  }

  /**
   * Check Google Calendar conflicts
   */
  async checkGCalConflicts(shift, user) {
    const conflicts = [];
    const shiftStart = new Date(shift.startTime);
    const shiftEnd = new Date(shift.endTime);

    try {
      // Get user's GCal events for the shift date
      const events = await gCalendarService.getUserEventsForDate(
        user._id,
        shiftStart,
        "constraint-engine"
      );

      for (const event of events) {
        const eventStart = new Date(event.start.dateTime || event.start.date);
        const eventEnd = new Date(event.end.dateTime || event.end.date);

        // Check for overlap
        if (this.timesOverlap(shiftStart, shiftEnd, eventStart, eventEnd)) {
          conflicts.push(event.summary || "Untitled Event");
        }
      }
    } catch (error) {
      console.warn(`GCal check failed for user ${user._id}:`, error.message);
    }

    return conflicts;
  }

  /**
   * Validate skill requirements
   */
  async validateSkills(shifts, users, positions) {
    const userMap = new Map(users.map((u) => [u._id.toString(), u]));
    const positionMap = new Map(positions.map((p) => [p._id.toString(), p]));

    for (const shift of shifts) {
      const user = userMap.get(shift.userId);
      const position = positionMap.get(shift.positionId);

      if (!user || !position) continue;

      const userSkills = user.skills.map((s) => s.toString());
      const requiredSkills = position.requiredSkills.map((s) => s.toString());

      const missingSkills = requiredSkills.filter(
        (skill) => !userSkills.includes(skill)
      );

      if (missingSkills.length > 0) {
        this.addViolation(
          "SKILLS",
          `Missing required skills: ${missingSkills.join(", ")}`,
          shift
        );
      }
    }
  }

  /**
   * Validate daily and weekly time limits
   */
  async validateTimeLimits(shifts, users) {
    const userMap = new Map(users.map((u) => [u._id.toString(), u]));
    const userShifts = new Map();

    // Group shifts by user
    for (const shift of shifts) {
      const userId = shift.userId;
      if (!userShifts.has(userId)) {
        userShifts.set(userId, []);
      }
      userShifts.get(userId).push(shift);
    }

    // Check limits for each user
    for (const [userId, userShiftsList] of userShifts) {
      const user = userMap.get(userId);
      if (!user) continue;

      // Group by day and week
      const dailyMinutes = new Map();
      const weeklyMinutes = new Map();

      for (const shift of userShiftsList) {
        const start = new Date(shift.startTime);
        const end = new Date(shift.endTime);
        const duration = (end - start) / (1000 * 60); // minutes

        const dayKey = start.toDateString();
        const weekKey = this.getWeekKey(start);

        dailyMinutes.set(dayKey, (dailyMinutes.get(dayKey) || 0) + duration);
        weeklyMinutes.set(
          weekKey,
          (weeklyMinutes.get(weekKey) || 0) + duration
        );
      }

      // Check daily limits
      for (const [day, minutes] of dailyMinutes) {
        if (minutes > user.dailyMaxLimit) {
          this.addViolation(
            "TIME_LIMITS",
            `Daily limit exceeded: ${Math.round(minutes)}min > ${
              user.dailyMaxLimit
            }min on ${day}`,
            { userId, day, minutes, limit: user.dailyMaxLimit }
          );
        }
      }

      // Check weekly limits
      for (const [week, minutes] of weeklyMinutes) {
        if (minutes > user.weeklyMaxLimit) {
          this.addViolation(
            "TIME_LIMITS",
            `Weekly limit exceeded: ${Math.round(minutes)}min > ${
              user.weeklyMaxLimit
            }min in week ${week}`,
            { userId, week, minutes, limit: user.weeklyMaxLimit }
          );
        }
      }
    }
  }

  /**
   * Validate activity-specific rules
   */
  async validateActivityRules(shifts, positions) {
    const positionMap = new Map(positions.map((p) => [p._id.toString(), p]));

    for (const shift of shifts) {
      const position = positionMap.get(shift.positionId);
      if (!position) continue;

      const start = new Date(shift.startTime);
      const end = new Date(shift.endTime);
      const duration = (end - start) / (1000 * 60); // minutes

      // Check min/max time constraints
      if (duration < position.minTime) {
        this.addViolation(
          "ACTIVITY_RULES",
          `Shift too short: ${Math.round(duration)}min < ${
            position.minTime
          }min minimum`,
          shift
        );
      }

      if (duration > position.maxTime) {
        this.addViolation(
          "ACTIVITY_RULES",
          `Shift too long: ${Math.round(duration)}min > ${
            position.maxTime
          }min maximum`,
          shift
        );
      }
    }

    // Check break requirements after stress activities
    await this.validateBreakRequirements(shifts, positions);
  }

  /**
   * Validate break requirements after stress activities
   */
  async validateBreakRequirements(shifts, positions) {
    const positionMap = new Map(positions.map((p) => [p._id.toString(), p]));
    const userShifts = new Map();

    // Group shifts by user and sort by time
    for (const shift of shifts) {
      const userId = shift.userId;
      if (!userShifts.has(userId)) {
        userShifts.set(userId, []);
      }
      userShifts.get(userId).push(shift);
    }

    for (const [userId, userShiftsList] of userShifts) {
      // Sort by start time
      userShiftsList.sort(
        (a, b) => new Date(a.startTime) - new Date(b.startTime)
      );

      for (let i = 0; i < userShiftsList.length - 1; i++) {
        const currentShift = userShiftsList[i];
        const nextShift = userShiftsList[i + 1];

        const currentPosition = positionMap.get(currentShift.positionId);
        const nextPosition = positionMap.get(nextShift.positionId);

        // If current shift is stress activity, next should be break or have gap
        if (currentPosition?.stress) {
          const currentEnd = new Date(currentShift.endTime);
          const nextStart = new Date(nextShift.startTime);
          const gap = (nextStart - currentEnd) / (1000 * 60); // minutes

          // Check if next shift is a break (you might need to define break positions)
          const isBreak =
            nextPosition?.type === "break" ||
            nextPosition?.name.toLowerCase().includes("break");

          if (!isBreak && gap < 15) {
            // 15 minute minimum gap
            this.addViolation(
              "ACTIVITY_RULES",
              `Break required after stress activity: only ${Math.round(
                gap
              )}min gap`,
              { userId, currentShift, nextShift }
            );
          }
        }
      }
    }
  }

  /**
   * Validate no double-booking conflicts
   */
  async validateConflicts(shifts) {
    const userShifts = new Map();

    // Group shifts by user
    for (const shift of shifts) {
      const userId = shift.userId;
      if (!userShifts.has(userId)) {
        userShifts.set(userId, []);
      }
      userShifts.get(userId).push(shift);
    }

    // Check for overlaps within each user's shifts
    for (const [userId, userShiftsList] of userShifts) {
      for (let i = 0; i < userShiftsList.length; i++) {
        for (let j = i + 1; j < userShiftsList.length; j++) {
          const shift1 = userShiftsList[i];
          const shift2 = userShiftsList[j];

          const start1 = new Date(shift1.startTime);
          const end1 = new Date(shift1.endTime);
          const start2 = new Date(shift2.startTime);
          const end2 = new Date(shift2.endTime);

          if (this.timesOverlap(start1, end1, start2, end2)) {
            this.addViolation("CONFLICTS", `Double-booking: shifts overlap`, {
              userId,
              shift1,
              shift2,
            });
          }
        }
      }
    }
  }

  /**
   * Validate coverage against demand forecasts
   */
  async validateCoverage(shifts, forecasts, positions) {
    if (!forecasts || forecasts.length === 0) return;

    const positionMap = new Map(positions.map((p) => [p._id.toString(), p]));
    const forecastMap = new Map();

    // Group forecasts by time slot and activity
    for (const forecast of forecasts) {
      const key = `${forecast.date.toISOString()}_${forecast.slot_index}_${
        forecast.activity
      }`;
      forecastMap.set(key, forecast);
    }

    // Group shifts by time slot and position
    const shiftMap = new Map();
    for (const shift of shifts) {
      const start = new Date(shift.startTime);
      const slotIndex = this.getSlotIndex(start);
      const position = positionMap.get(shift.positionId);
      const activity = position?.type || "unknown";

      const key = `${
        start.toISOString().split("T")[0]
      }_${slotIndex}_${activity}`;
      if (!shiftMap.has(key)) {
        shiftMap.set(key, []);
      }
      shiftMap.get(key).push(shift);
    }

    // Check coverage
    for (const [key, forecast] of forecastMap) {
      const scheduledShifts = shiftMap.get(key) || [];
      const scheduledCount = scheduledShifts.length;
      const requiredCount = forecast.required_agents;

      if (scheduledCount < requiredCount) {
        this.addViolation(
          "COVERAGE",
          `Undercoverage: ${scheduledCount} agents < ${requiredCount} required for ${forecast.activity}`,
          { key, scheduled: scheduledCount, required: requiredCount, forecast }
        );
      }
    }
  }

  /**
   * Helper methods
   */
  addViolation(type, message, data) {
    this.violations.push({
      type,
      message,
      data,
      timestamp: new Date().toISOString(),
    });
  }

  timesOverlap(start1, end1, start2, end2) {
    return start1 < end2 && start2 < end1;
  }

  getDayName(dayOfWeek) {
    const days = [
      "Sunday",
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
    ];
    return days[dayOfWeek];
  }

  formatMinutes(minutes) {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours.toString().padStart(2, "0")}:${mins
      .toString()
      .padStart(2, "0")}`;
  }

  getWeekKey(date) {
    const year = date.getFullYear();
    const week = this.getWeekNumber(date);
    return `${year}-W${week.toString().padStart(2, "0")}`;
  }

  getWeekNumber(date) {
    const d = new Date(
      Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())
    );
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  }

  getSlotIndex(date) {
    // Assuming 15-minute slots, adjust as needed
    const hours = date.getHours();
    const minutes = date.getMinutes();
    return hours * 4 + Math.floor(minutes / 15);
  }

  calculateMetrics() {
    const totalViolations = this.violations.length;
    const totalShifts = this.metrics.totalShifts;

    // Calculate scores (0-100, higher is better)
    this.metrics.availabilityScore = Math.max(
      0,
      100 -
        (this.violations.filter((v) => v.type === "AVAILABILITY").length /
          totalShifts) *
          100
    );
    this.metrics.skillMatchScore = Math.max(
      0,
      100 -
        (this.violations.filter((v) => v.type === "SKILLS").length /
          totalShifts) *
          100
    );
    this.metrics.coverageScore = Math.max(
      0,
      100 -
        (this.violations.filter((v) => v.type === "COVERAGE").length /
          Math.max(1, this.metrics.totalShifts)) *
          100
    );
  }

  generateSuggestions() {
    const suggestions = [];

    // Group violations by type for suggestions
    const violationTypes = {};
    for (const violation of this.violations) {
      if (!violationTypes[violation.type]) {
        violationTypes[violation.type] = [];
      }
      violationTypes[violation.type].push(violation);
    }

    // Generate suggestions based on violation types
    if (violationTypes.AVAILABILITY?.length > 0) {
      suggestions.push({
        type: "AVAILABILITY",
        message:
          "Consider adjusting work hours or checking Google Calendar conflicts",
        count: violationTypes.AVAILABILITY.length,
      });
    }

    if (violationTypes.SKILLS?.length > 0) {
      suggestions.push({
        type: "SKILLS",
        message:
          "Assign users with required skills or update position requirements",
        count: violationTypes.SKILLS.length,
      });
    }

    if (violationTypes.COVERAGE?.length > 0) {
      suggestions.push({
        type: "COVERAGE",
        message: "Add more shifts to meet demand forecast requirements",
        count: violationTypes.COVERAGE.length,
      });
    }

    return suggestions;
  }
}

// Export singleton instance
const constraintEngine = new ConstraintEngine();
export default constraintEngine;
