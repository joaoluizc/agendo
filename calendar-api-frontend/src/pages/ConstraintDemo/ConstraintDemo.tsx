import React, { useState, useEffect } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import { Alert, AlertDescription } from "../../components/ui/alert";
import { Textarea } from "../../components/ui/textarea";
import { Label } from "../../components/ui/label";
import {
  CheckCircle,
  XCircle,
  AlertTriangle,
  Info,
  Users,
  Calendar,
  Clock,
  Code,
  Loader2,
} from "lucide-react";
import ConstraintValidation from "../../components/ConstraintValidation/ConstraintValidation";
import { useConstraintValidation } from "../../hooks/useConstraintValidation";
import { toast } from "sonner";

// Example JSON format for reference
const exampleSchedule = `[
  {
    "userId": "user1",
    "positionId": "pos1",
    "startTime": "2024-01-15T09:00:00Z",
    "endTime": "2024-01-15T17:00:00Z"
  },
  {
    "userId": "user2",
    "positionId": "pos2",
    "startTime": "2024-01-15T10:00:00Z",
    "endTime": "2024-01-15T18:00:00Z"
  },
  {
    "userId": "user1",
    "positionId": "pos1",
    "startTime": "2024-01-15T16:00:00Z",
    "endTime": "2024-01-15T20:00:00Z"
  }
]`;

const mockDateRange = {
  start: "2024-01-15T00:00:00Z",
  end: "2024-01-15T23:59:59Z",
};

const ConstraintDemo: React.FC = () => {
  const [shifts, setShifts] = useState<any[]>([]);
  const [dateRange, setDateRange] = useState(mockDateRange);
  const [jsonInput, setJsonInput] = useState(exampleSchedule);
  const [isValidJson, setIsValidJson] = useState(true);
  const [jsonError, setJsonError] = useState<string | null>(null);
  const { validateSchedule, validationResult, isValidating } =
    useConstraintValidation();

  const handleValidationComplete = (result: any) => {
    console.log("Validation completed:", result);
  };

  const parseJsonInput = () => {
    try {
      const parsed = JSON.parse(jsonInput);
      if (Array.isArray(parsed)) {
        setShifts(parsed);
        setIsValidJson(true);
        setJsonError(null);
        toast.success("Schedule loaded successfully");
      } else {
        setIsValidJson(false);
        setJsonError("Input must be an array of shifts");
        toast.error("Input must be an array of shifts");
      }
    } catch (error) {
      setIsValidJson(false);
      setJsonError(error instanceof Error ? error.message : "Invalid JSON");
      toast.error("Invalid JSON format");
    }
  };

  const clearInput = () => {
    setJsonInput("");
    setShifts([]);
    setIsValidJson(true);
    setJsonError(null);
  };

  const loadExample = () => {
    setJsonInput(exampleSchedule);
    parseJsonInput();
  };

  const validateCurrentSchedule = () => {
    if (shifts.length === 0) {
      toast.error("No shifts to validate. Please load a schedule first.");
      return;
    }
    validateSchedule(shifts, dateRange);
  };

  // Auto-parse JSON when input changes (with debounce)
  useEffect(() => {
    const timer = setTimeout(() => {
      if (jsonInput.trim()) {
        try {
          JSON.parse(jsonInput);
          setIsValidJson(true);
          setJsonError(null);
        } catch (error) {
          setIsValidJson(false);
          setJsonError(error instanceof Error ? error.message : "Invalid JSON");
        }
      } else {
        setIsValidJson(true);
        setJsonError(null);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [jsonInput]);

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold">Constraint Validation Demo</h1>
        <p className="text-gray-600">
          Test the constraint validation system by entering a schedule in JSON
          format
        </p>
      </div>

      {/* JSON Input Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Code className="h-5 w-5" />
            Schedule Input
          </CardTitle>
          <CardDescription>
            Enter your schedule as JSON. Each shift should have userId,
            positionId, startTime, and endTime.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="json-input">Schedule JSON</Label>
            <Textarea
              id="json-input"
              value={jsonInput}
              onChange={(e) => setJsonInput(e.target.value)}
              placeholder="Enter your schedule as JSON..."
              className={`min-h-[300px] font-mono text-sm ${
                !isValidJson ? "border-red-500" : ""
              }`}
            />
            {jsonError && (
              <Alert className="border-red-200 bg-red-50">
                <XCircle className="h-4 w-4" />
                <AlertDescription className="text-red-800">
                  {jsonError}
                </AlertDescription>
              </Alert>
            )}
            {isValidJson && jsonInput.trim() && (
              <Alert className="border-green-200 bg-green-50">
                <CheckCircle className="h-4 w-4" />
                <AlertDescription className="text-green-800">
                  Valid JSON format
                </AlertDescription>
              </Alert>
            )}
          </div>

          <div className="flex gap-2 flex-wrap">
            <Button
              onClick={parseJsonInput}
              disabled={!isValidJson || !jsonInput.trim()}
            >
              Load Schedule
            </Button>
            <Button onClick={loadExample} variant="outline">
              Load Example
            </Button>
            <Button onClick={clearInput} variant="outline">
              Clear
            </Button>
            <Button
              onClick={validateCurrentSchedule}
              disabled={isValidating || shifts.length === 0}
              className="ml-auto"
            >
              {isValidating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Validating...
                </>
              ) : (
                "Validate Schedule"
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Current Schedule Summary */}
      {shifts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Current Schedule ({shifts.length} shifts)
            </CardTitle>
            <CardDescription>
              The loaded schedule that will be validated
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {shifts.map((shift, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between p-3 border rounded"
                >
                  <div className="flex items-center gap-3">
                    <Badge variant="outline">#{index + 1}</Badge>
                    <div>
                      <div className="font-medium">User {shift.userId}</div>
                      <div className="text-sm text-gray-600">
                        {new Date(shift.startTime).toLocaleString()} -{" "}
                        {new Date(shift.endTime).toLocaleString()}
                      </div>
                    </div>
                  </div>
                  <Badge variant="secondary">Position {shift.positionId}</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Constraint Validation Component */}
      <ConstraintValidation
        shifts={shifts}
        dateRange={dateRange}
        onValidationComplete={handleValidationComplete}
      />

      {/* JSON Format Help */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Info className="h-5 w-5" />
            JSON Format Help
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div>
              <h4 className="font-semibold mb-2">Required Fields:</h4>
              <div className="space-y-1 text-sm font-mono bg-gray-100 p-3 rounded">
                <div>
                  <span className="text-blue-600">"userId"</span>: string - ID
                  of the user assigned to the shift
                </div>
                <div>
                  <span className="text-blue-600">"positionId"</span>: string -
                  ID of the position/role
                </div>
                <div>
                  <span className="text-blue-600">"startTime"</span>: string -
                  ISO 8601 datetime (e.g., "2024-01-15T09:00:00Z")
                </div>
                <div>
                  <span className="text-blue-600">"endTime"</span>: string - ISO
                  8601 datetime (e.g., "2024-01-15T17:00:00Z")
                </div>
              </div>
            </div>

            <div>
              <h4 className="font-semibold mb-2">Example:</h4>
              <pre className="text-sm bg-gray-100 p-3 rounded overflow-x-auto">
                {`[
  {
    "userId": "user1",
    "positionId": "pos1", 
    "startTime": "2024-01-15T09:00:00Z",
    "endTime": "2024-01-15T17:00:00Z"
  }
]`}
              </pre>
            </div>

            <div>
              <h4 className="font-semibold mb-2">Validation Rules:</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                <div className="flex items-center gap-2">
                  <XCircle className="h-4 w-4 text-red-500" />
                  <span>Availability (work hours + GCal conflicts)</span>
                </div>
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-orange-500" />
                  <span>Skills match position requirements</span>
                </div>
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-yellow-500" />
                  <span>Daily/weekly time limits</span>
                </div>
                <div className="flex items-center gap-2">
                  <XCircle className="h-4 w-4 text-red-500" />
                  <span>No double-booking conflicts</span>
                </div>
                <div className="flex items-center gap-2">
                  <Info className="h-4 w-4 text-blue-500" />
                  <span>Activity-specific rules (min/max time)</span>
                </div>
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-orange-500" />
                  <span>Coverage vs demand forecast</span>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default ConstraintDemo;
