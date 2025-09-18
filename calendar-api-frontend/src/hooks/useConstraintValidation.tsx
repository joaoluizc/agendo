import { useState, useCallback } from "react";
import { toast } from "sonner";

interface ConstraintViolation {
  type:
    | "AVAILABILITY"
    | "SKILLS"
    | "TIME_LIMITS"
    | "ACTIVITY_RULES"
    | "CONFLICTS"
    | "COVERAGE";
  message: string;
  data: any;
  timestamp: string;
}

interface ConstraintMetrics {
  totalShifts: number;
  totalUsers: number;
  totalPositions: number;
  coverageScore: number;
  skillMatchScore: number;
  availabilityScore: number;
}

interface ConstraintSuggestion {
  type: string;
  message: string;
  count: number;
}

interface ConstraintValidationResult {
  ok: boolean;
  violations: ConstraintViolation[];
  metrics: ConstraintMetrics;
  suggestions: ConstraintSuggestion[];
}

interface UseConstraintValidationReturn {
  validationResult: ConstraintValidationResult | null;
  isValidating: boolean;
  validateSchedule: (
    shifts: any[],
    dateRange: { start: string; end: string }
  ) => Promise<ConstraintValidationResult | null>;
  validateShift: (
    shift: any,
    userId: string,
    positionId: string
  ) => Promise<ConstraintValidationResult | null>;
  getAvailableUsers: (
    start: string,
    end: string,
    positionId: string
  ) => Promise<any[]>;
  clearValidation: () => void;
}

export const useConstraintValidation = (): UseConstraintValidationReturn => {
  const [validationResult, setValidationResult] =
    useState<ConstraintValidationResult | null>(null);
  const [isValidating, setIsValidating] = useState(false);

  const validateSchedule = useCallback(
    async (
      shifts: any[],
      dateRange: { start: string; end: string }
    ): Promise<ConstraintValidationResult | null> => {
      if (!shifts || shifts.length === 0) {
        toast.error("No shifts to validate");
        return null;
      }

      setIsValidating(true);
      try {
        const response = await fetch("/api/constraints/validate", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            shifts,
            dateRange,
          }),
        });

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const result: ConstraintValidationResult = await response.json();
        setValidationResult(result);

        if (result.ok) {
          toast.success("Schedule validation passed!");
        } else {
          toast.error(
            `Schedule validation failed with ${result.violations.length} violations`
          );
        }

        return result;
      } catch (error) {
        console.error("Error validating schedule:", error);
        toast.error("Failed to validate schedule");
        return null;
      } finally {
        setIsValidating(false);
      }
    },
    []
  );

  const validateShift = useCallback(
    async (
      shift: any,
      userId: string,
      positionId: string
    ): Promise<ConstraintValidationResult | null> => {
      setIsValidating(true);
      try {
        const response = await fetch("/api/constraints/validate-shift", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            shift,
            userId,
            positionId,
          }),
        });

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const result: ConstraintValidationResult = await response.json();
        setValidationResult(result);

        if (result.ok) {
          toast.success("Shift validation passed!");
        } else {
          toast.error(
            `Shift validation failed with ${result.violations.length} violations`
          );
        }

        return result;
      } catch (error) {
        console.error("Error validating shift:", error);
        toast.error("Failed to validate shift");
        return null;
      } finally {
        setIsValidating(false);
      }
    },
    []
  );

  const getAvailableUsers = useCallback(
    async (start: string, end: string, positionId: string): Promise<any[]> => {
      try {
        const response = await fetch(
          `/api/constraints/available-users?start=${encodeURIComponent(
            start
          )}&end=${encodeURIComponent(end)}&positionId=${positionId}`,
          {
            method: "GET",
            headers: {
              "Content-Type": "application/json",
            },
          }
        );

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        return data.availableUsers || [];
      } catch (error) {
        console.error("Error getting available users:", error);
        toast.error("Failed to get available users");
        return [];
      }
    },
    []
  );

  const clearValidation = useCallback(() => {
    setValidationResult(null);
  }, []);

  return {
    validationResult,
    isValidating,
    validateSchedule,
    validateShift,
    getAvailableUsers,
    clearValidation,
  };
};
