import React, { useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../ui/card";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Alert, AlertDescription } from "../ui/alert";
import { CheckCircle, XCircle, AlertTriangle, Info } from "lucide-react";
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

interface ConstraintValidationProps {
  shifts: any[];
  dateRange: { start: string; end: string };
  onValidationComplete?: (result: ConstraintValidationResult) => void;
}

const ConstraintValidation: React.FC<ConstraintValidationProps> = ({
  shifts,
  dateRange,
  onValidationComplete,
}) => {
  const [validationResult, setValidationResult] =
    useState<ConstraintValidationResult | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  const validateSchedule = async () => {
    if (!shifts || shifts.length === 0) {
      toast.error("No shifts to validate");
      return;
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

      const result: ConstraintValidationResult = await response.json();
      setValidationResult(result);

      if (onValidationComplete) {
        onValidationComplete(result);
      }

      if (result.ok) {
        toast.success("Schedule validation passed!");
      } else {
        toast.error(
          `Schedule validation failed with ${result.violations.length} violations`
        );
      }
    } catch (error) {
      console.error("Error validating schedule:", error);
      toast.error("Failed to validate schedule");
    } finally {
      setIsValidating(false);
    }
  };

  const getViolationIcon = (type: string) => {
    switch (type) {
      case "AVAILABILITY":
        return <XCircle className="h-4 w-4 text-red-500" />;
      case "SKILLS":
        return <AlertTriangle className="h-4 w-4 text-orange-500" />;
      case "TIME_LIMITS":
        return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
      case "ACTIVITY_RULES":
        return <Info className="h-4 w-4 text-blue-500" />;
      case "CONFLICTS":
        return <XCircle className="h-4 w-4 text-red-500" />;
      case "COVERAGE":
        return <AlertTriangle className="h-4 w-4 text-orange-500" />;
      default:
        return <Info className="h-4 w-4 text-gray-500" />;
    }
  };

  const getViolationColor = (type: string) => {
    switch (type) {
      case "AVAILABILITY":
      case "CONFLICTS":
        return "destructive";
      case "SKILLS":
      case "COVERAGE":
        return "secondary";
      case "TIME_LIMITS":
        return "outline";
      case "ACTIVITY_RULES":
        return "default";
      default:
        return "outline";
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 90) return "text-green-600";
    if (score >= 70) return "text-yellow-600";
    return "text-red-600";
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckCircle className="h-5 w-5" />
            Constraint Validation
          </CardTitle>
          <CardDescription>
            Validate your schedule against business rules and constraints
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2 mb-4">
            <Button
              onClick={validateSchedule}
              disabled={isValidating || !shifts || shifts.length === 0}
              className="flex-1"
            >
              {isValidating ? "Validating..." : "Validate Schedule"}
            </Button>
            {validationResult && (
              <Button
                variant="outline"
                onClick={() => setShowDetails(!showDetails)}
              >
                {showDetails ? "Hide Details" : "Show Details"}
              </Button>
            )}
          </div>

          {validationResult && (
            <div className="space-y-4">
              {/* Overall Status */}
              <Alert
                className={
                  validationResult.ok
                    ? "border-green-200 bg-green-50"
                    : "border-red-200 bg-red-50"
                }
              >
                <div className="flex items-center gap-2">
                  {validationResult.ok ? (
                    <CheckCircle className="h-4 w-4 text-green-600" />
                  ) : (
                    <XCircle className="h-4 w-4 text-red-600" />
                  )}
                  <AlertDescription>
                    {validationResult.ok
                      ? "Schedule validation passed successfully!"
                      : `Schedule validation failed with ${validationResult.violations.length} violations`}
                  </AlertDescription>
                </div>
              </Alert>

              {/* Metrics */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="text-center">
                  <div className="text-2xl font-bold">
                    {validationResult.metrics.totalShifts}
                  </div>
                  <div className="text-sm text-gray-600">Total Shifts</div>
                </div>
                <div className="text-center">
                  <div
                    className={`text-2xl font-bold ${getScoreColor(
                      validationResult.metrics.availabilityScore
                    )}`}
                  >
                    {Math.round(validationResult.metrics.availabilityScore)}%
                  </div>
                  <div className="text-sm text-gray-600">Availability</div>
                </div>
                <div className="text-center">
                  <div
                    className={`text-2xl font-bold ${getScoreColor(
                      validationResult.metrics.skillMatchScore
                    )}`}
                  >
                    {Math.round(validationResult.metrics.skillMatchScore)}%
                  </div>
                  <div className="text-sm text-gray-600">Skills Match</div>
                </div>
                <div className="text-center">
                  <div
                    className={`text-2xl font-bold ${getScoreColor(
                      validationResult.metrics.coverageScore
                    )}`}
                  >
                    {Math.round(validationResult.metrics.coverageScore)}%
                  </div>
                  <div className="text-sm text-gray-600">Coverage</div>
                </div>
              </div>

              {/* Violations */}
              {validationResult.violations.length > 0 && (
                <div>
                  <h4 className="font-semibold mb-2">
                    Violations ({validationResult.violations.length})
                  </h4>
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {validationResult.violations.map((violation, index) => (
                      <div
                        key={index}
                        className="flex items-start gap-2 p-2 border rounded"
                      >
                        {getViolationIcon(violation.type)}
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <Badge variant={getViolationColor(violation.type)}>
                              {violation.type}
                            </Badge>
                            <span className="text-sm text-gray-500">
                              {new Date(
                                violation.timestamp
                              ).toLocaleTimeString()}
                            </span>
                          </div>
                          <p className="text-sm">{violation.message}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Suggestions */}
              {validationResult.suggestions.length > 0 && showDetails && (
                <div>
                  <h4 className="font-semibold mb-2">Suggestions</h4>
                  <div className="space-y-2">
                    {validationResult.suggestions.map((suggestion, index) => (
                      <div
                        key={index}
                        className="flex items-center gap-2 p-2 bg-blue-50 border border-blue-200 rounded"
                      >
                        <Info className="h-4 w-4 text-blue-600" />
                        <div className="flex-1">
                          <p className="text-sm">{suggestion.message}</p>
                          <p className="text-xs text-blue-600">
                            {suggestion.count} related issue
                            {suggestion.count !== 1 ? "s" : ""}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default ConstraintValidation;
