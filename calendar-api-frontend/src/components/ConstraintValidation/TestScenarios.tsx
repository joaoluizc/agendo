import React, { useState, useEffect } from "react";
import { Button } from "../ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../ui/card";
import { Badge } from "../ui/badge";
import { Alert, AlertDescription } from "../ui/alert";
import {
  Clock,
  User,
  AlertTriangle,
  XCircle,
  CheckCircle,
  Info,
  Zap,
  Loader2,
} from "lucide-react";
import {
  demoDataService,
  DemoUser,
  DemoPosition,
} from "../../services/demoDataService";

interface TestScenario {
  id: string;
  name: string;
  description: string;
  shifts: any[];
  expectedViolations: string[];
  difficulty: "Easy" | "Medium" | "Hard";
  category: string;
}

interface TestScenariosProps {
  onLoadScenario: (shifts: any[]) => void;
}

const TestScenarios: React.FC<TestScenariosProps> = ({ onLoadScenario }) => {
  const [users, setUsers] = useState<DemoUser[]>([]);
  const [positions, setPositions] = useState<DemoPosition[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Load real data on component mount
  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      try {
        const [usersData, positionsData] = await Promise.all([
          demoDataService.fetchUsers(),
          demoDataService.fetchPositions(),
        ]);
        setUsers(usersData);
        setPositions(positionsData);
      } catch (error) {
        console.error("Error loading demo data:", error);
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, []);

  // Generate scenarios based on real data
  const generateScenarios = (): TestScenario[] => {
    if (users.length === 0 || positions.length === 0) return [];

    const chatPosition = positions.find((p) => p.type === "chat");
    const ticketPosition = positions.find((p) => p.type === "tickets");
    const escalationPosition = positions.find((p) => p.type === "escalation");
    const breakPosition = positions.find((p) => p.type === "break");

    const alice = users.find((u) => u.firstName === "Alice");
    const bob = users.find((u) => u.firstName === "Bob");
    const carol = users.find((u) => u.firstName === "Carol");

    if (
      !alice ||
      !bob ||
      !carol ||
      !chatPosition ||
      !ticketPosition ||
      !escalationPosition ||
      !breakPosition
    ) {
      return [];
    }

    return [
      {
        id: "availability-violation",
        name: "Work Hours Violation",
        description: "Schedule shifts outside user's work hours",
        shifts: [
          {
            userId: alice._id,
            positionId: chatPosition._id,
            startTime: "2024-01-15T06:00:00Z", // 6 AM - before work hours
            endTime: "2024-01-15T10:00:00Z",
          },
          {
            userId: alice._id,
            positionId: chatPosition._id,
            startTime: "2024-01-15T20:00:00Z", // 8 PM - after work hours
            endTime: "2024-01-15T22:00:00Z",
          },
        ],
        expectedViolations: ["AVAILABILITY"],
        difficulty: "Easy",
        category: "Availability",
      },
      {
        id: "skills-mismatch",
        name: "Skills Mismatch",
        description:
          "Assign users to positions requiring skills they don't have",
        shifts: [
          {
            userId: bob._id, // Bob only has "chat" and "tickets" skills
            positionId: escalationPosition._id, // Escalation Handler requires "escalation" and "chat"
            startTime: "2024-01-15T09:00:00Z",
            endTime: "2024-01-15T17:00:00Z",
          },
        ],
        expectedViolations: ["SKILLS"],
        difficulty: "Easy",
        category: "Skills",
      },
      {
        id: "double-booking",
        name: "Double Booking",
        description: "Schedule overlapping shifts for the same user",
        shifts: [
          {
            userId: alice._id,
            positionId: chatPosition._id,
            startTime: "2024-01-15T09:00:00Z",
            endTime: "2024-01-15T17:00:00Z",
          },
          {
            userId: alice._id, // Same user
            positionId: ticketPosition._id,
            startTime: "2024-01-15T16:00:00Z", // Overlaps with first shift
            endTime: "2024-01-15T20:00:00Z",
          },
        ],
        expectedViolations: ["CONFLICTS"],
        difficulty: "Easy",
        category: "Conflicts",
      },
      {
        id: "time-limits",
        name: "Time Limits Exceeded",
        description: "Schedule shifts that exceed daily/weekly limits",
        shifts: [
          {
            userId: alice._id,
            positionId: chatPosition._id,
            startTime: "2024-01-15T09:00:00Z",
            endTime: "2024-01-15T17:00:00Z", // 8 hours
          },
          {
            userId: alice._id, // Same user, same day
            positionId: ticketPosition._id,
            startTime: "2024-01-15T18:00:00Z",
            endTime: "2024-01-16T02:00:00Z", // 8 more hours = 16 total
          },
        ],
        expectedViolations: ["TIME_LIMITS"],
        difficulty: "Medium",
        category: "Time Limits",
      },
      {
        id: "activity-rules",
        name: "Activity Rules Violation",
        description: "Schedule shifts that violate position-specific rules",
        shifts: [
          {
            userId: alice._id,
            positionId: chatPosition._id, // Chat Support: min 30min, max 480min
            startTime: "2024-01-15T09:00:00Z",
            endTime: "2024-01-15T09:15:00Z", // Only 15 minutes - too short
          },
          {
            userId: bob._id,
            positionId: chatPosition._id,
            startTime: "2024-01-15T09:00:00Z",
            endTime: "2024-01-15T18:00:00Z", // 9 hours - too long
          },
        ],
        expectedViolations: ["ACTIVITY_RULES"],
        difficulty: "Medium",
        category: "Activity Rules",
      },
      {
        id: "stress-break-required",
        name: "Stress Activity Break Required",
        description: "Schedule stress activities without proper breaks",
        shifts: [
          {
            userId: alice._id,
            positionId: chatPosition._id, // Chat Support (stress: true)
            startTime: "2024-01-15T09:00:00Z",
            endTime: "2024-01-15T17:00:00Z",
          },
          {
            userId: alice._id, // Same user
            positionId: ticketPosition._id, // Ticket Resolution (not a break)
            startTime: "2024-01-15T17:05:00Z", // Only 5 minutes gap
            endTime: "2024-01-15T19:00:00Z",
          },
        ],
        expectedViolations: ["ACTIVITY_RULES"],
        difficulty: "Medium",
        category: "Activity Rules",
      },
      {
        id: "complex-scenario",
        name: "Complex Multi-Violation",
        description: "Multiple constraint violations in one scenario",
        shifts: [
          {
            userId: bob._id, // Wrong skills
            positionId: escalationPosition._id, // Escalation Handler
            startTime: "2024-01-15T06:00:00Z", // Outside work hours
            endTime: "2024-01-15T10:00:00Z",
          },
          {
            userId: alice._id,
            positionId: chatPosition._id,
            startTime: "2024-01-15T09:00:00Z",
            endTime: "2024-01-15T17:00:00Z",
          },
          {
            userId: alice._id, // Double booking
            positionId: ticketPosition._id,
            startTime: "2024-01-15T16:00:00Z",
            endTime: "2024-01-15T20:00:00Z",
          },
          {
            userId: carol._id,
            positionId: chatPosition._id,
            startTime: "2024-01-15T09:00:00Z",
            endTime: "2024-01-15T09:10:00Z", // Too short
          },
        ],
        expectedViolations: [
          "SKILLS",
          "AVAILABILITY",
          "CONFLICTS",
          "ACTIVITY_RULES",
        ],
        difficulty: "Hard",
        category: "Complex",
      },
      {
        id: "valid-schedule",
        name: "Valid Schedule",
        description: "A properly constructed schedule with no violations",
        shifts: [
          {
            userId: alice._id, // Has all required skills
            positionId: chatPosition._id, // Chat Support
            startTime: "2024-01-15T09:00:00Z", // Within work hours
            endTime: "2024-01-15T12:00:00Z", // 3 hours
          },
          {
            userId: alice._id,
            positionId: breakPosition._id, // Break Time
            startTime: "2024-01-15T12:00:00Z",
            endTime: "2024-01-15T12:30:00Z", // 30 min break
          },
          {
            userId: alice._id,
            positionId: ticketPosition._id, // Ticket Resolution
            startTime: "2024-01-15T12:30:00Z",
            endTime: "2024-01-15T17:00:00Z", // 4.5 hours
          },
          {
            userId: bob._id, // Different user
            positionId: chatPosition._id,
            startTime: "2024-01-15T10:00:00Z",
            endTime: "2024-01-15T18:00:00Z",
          },
        ],
        expectedViolations: [],
        difficulty: "Easy",
        category: "Valid",
      },
    ];
  };

  const scenarios = generateScenarios();

  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty) {
      case "Easy":
        return "bg-green-100 text-green-800";
      case "Medium":
        return "bg-yellow-100 text-yellow-800";
      case "Hard":
        return "bg-red-100 text-red-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const getViolationIcon = (violation: string) => {
    switch (violation) {
      case "AVAILABILITY":
      case "CONFLICTS":
        return <XCircle className="h-4 w-4 text-red-500" />;
      case "SKILLS":
      case "TIME_LIMITS":
        return <AlertTriangle className="h-4 w-4 text-orange-500" />;
      case "ACTIVITY_RULES":
        return <Info className="h-4 w-4 text-blue-500" />;
      default:
        return <Info className="h-4 w-4 text-gray-500" />;
    }
  };

  const handleLoadScenario = (scenario: TestScenario) => {
    onLoadScenario(scenario.shifts);
  };

  const groupedScenarios = scenarios.reduce((acc, scenario) => {
    if (!acc[scenario.category]) {
      acc[scenario.category] = [];
    }
    acc[scenario.category].push(scenario);
    return acc;
  }, {} as Record<string, TestScenario[]>);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5" />
            Test Scenarios
          </CardTitle>
          <CardDescription>
            Pre-built scenarios to test different constraint violations and
            valid schedules
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin mr-2" />
            <span>Loading test scenarios...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (scenarios.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5" />
            Test Scenarios
          </CardTitle>
          <CardDescription>
            Pre-built scenarios to test different constraint violations and
            valid schedules
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              No test scenarios available. Please ensure you have users and
              positions in your system.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Zap className="h-5 w-5" />
          Test Scenarios
        </CardTitle>
        <CardDescription>
          Pre-built scenarios to test different constraint violations and valid
          schedules
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          {Object.entries(groupedScenarios).map(
            ([category, categoryScenarios]) => (
              <div key={category}>
                <h3 className="font-semibold text-lg mb-3">{category}</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {categoryScenarios.map((scenario) => (
                    <Card
                      key={scenario.id}
                      className="border-l-4 border-l-blue-500"
                    >
                      <CardHeader className="pb-3">
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-base">
                            {scenario.name}
                          </CardTitle>
                          <Badge
                            className={getDifficultyColor(scenario.difficulty)}
                          >
                            {scenario.difficulty}
                          </Badge>
                        </div>
                        <CardDescription className="text-sm">
                          {scenario.description}
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="pt-0">
                        <div className="space-y-3">
                          {/* Expected Violations */}
                          {scenario.expectedViolations.length > 0 ? (
                            <div>
                              <p className="text-sm font-medium mb-2">
                                Expected Violations:
                              </p>
                              <div className="flex flex-wrap gap-1">
                                {scenario.expectedViolations.map(
                                  (violation) => (
                                    <div
                                      key={violation}
                                      className="flex items-center gap-1 text-xs"
                                    >
                                      {getViolationIcon(violation)}
                                      <span>{violation}</span>
                                    </div>
                                  )
                                )}
                              </div>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1 text-green-600">
                              <CheckCircle className="h-4 w-4" />
                              <span className="text-sm font-medium">
                                No violations expected
                              </span>
                            </div>
                          )}

                          {/* Shift Count */}
                          <div className="flex items-center gap-1 text-sm text-gray-600">
                            <Clock className="h-3 w-3" />
                            <span>
                              {scenario.shifts.length} shift
                              {scenario.shifts.length !== 1 ? "s" : ""}
                            </span>
                          </div>

                          {/* Load Button */}
                          <Button
                            size="sm"
                            onClick={() => handleLoadScenario(scenario)}
                            className="w-full"
                          >
                            Load Scenario
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )
          )}
        </div>

        {/* Usage Instructions */}
        <Alert className="mt-6">
          <Info className="h-4 w-4" />
          <AlertDescription>
            <strong>How to use:</strong> Click "Load Scenario" to populate the
            shift creator with test data. Then use "Validate Schedule" to see
            the constraint validation results. Try different scenarios to
            understand how each constraint type works.
          </AlertDescription>
        </Alert>
      </CardContent>
    </Card>
  );
};

export default TestScenarios;
