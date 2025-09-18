import React, { useState } from "react";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../ui/dialog";
import { Alert, AlertDescription } from "../ui/alert";
import { Badge } from "../ui/badge";
import { CheckCircle, XCircle, AlertTriangle } from "lucide-react";
import { useConstraintValidation } from "../../hooks/useConstraintValidation";
import CreateShiftDialog from "../ScheduleCalendar/calendar-components/CreateShiftDialog";

interface ConstraintAwareShiftDialogProps {
  selectedDate: Date;
  selectedUserId: string;
  children: React.ReactNode;
}

const ConstraintAwareShiftDialog: React.FC<ConstraintAwareShiftDialogProps> = ({
  selectedDate,
  selectedUserId,
  children,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [pendingShift, setPendingShift] = useState<any>(null);
  const { validateShift, validationResult, isValidating } =
    useConstraintValidation();

  const handleShiftData = (shiftData: any) => {
    setPendingShift(shiftData);
  };

  const handleValidateAndCreate = async () => {
    if (!pendingShift) return;

    const result = await validateShift(
      {
        startTime: pendingShift.startTime,
        endTime: pendingShift.endTime,
      },
      pendingShift.userIds[0], // Assuming single user for now
      pendingShift.positionId
    );

    if (result?.ok) {
      // Proceed with shift creation
      setIsOpen(false);
      setPendingShift(null);
      // You would call your actual shift creation logic here
      console.log("Shift validated and ready to create:", pendingShift);
    }
  };

  const getViolationIcon = (type: string) => {
    switch (type) {
      case "AVAILABILITY":
      case "CONFLICTS":
        return <XCircle className="h-4 w-4 text-red-500" />;
      case "SKILLS":
      case "COVERAGE":
        return <AlertTriangle className="h-4 w-4 text-orange-500" />;
      default:
        return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Shift with Constraint Validation</DialogTitle>
          <DialogDescription>
            Create a new shift with real-time constraint validation
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Shift Creation Form */}
          <div className="border rounded-lg p-4">
            <h3 className="font-semibold mb-2">Shift Details</h3>
            <CreateShiftDialog
              selectedDate={selectedDate}
              selectedUserId={selectedUserId}
              onShiftData={handleShiftData}
            >
              <Button variant="outline" className="w-full">
                Configure Shift Details
              </Button>
            </CreateShiftDialog>
          </div>

          {/* Constraint Validation Results */}
          {validationResult && (
            <div className="space-y-3">
              <h3 className="font-semibold">Validation Results</h3>

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
                      ? "Shift validation passed!"
                      : `Shift validation failed with ${validationResult.violations.length} violations`}
                  </AlertDescription>
                </div>
              </Alert>

              {/* Violations */}
              {validationResult.violations.length > 0 && (
                <div>
                  <h4 className="font-medium mb-2">Issues Found:</h4>
                  <div className="space-y-2">
                    {validationResult.violations.map((violation, index) => (
                      <div
                        key={index}
                        className="flex items-start gap-2 p-2 border rounded"
                      >
                        {getViolationIcon(violation.type)}
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <Badge variant="destructive" className="text-xs">
                              {violation.type}
                            </Badge>
                          </div>
                          <p className="text-sm">{violation.message}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Suggestions */}
              {validationResult.suggestions.length > 0 && (
                <div>
                  <h4 className="font-medium mb-2">Suggestions:</h4>
                  <div className="space-y-1">
                    {validationResult.suggestions.map((suggestion, index) => (
                      <div
                        key={index}
                        className="text-sm text-blue-600 bg-blue-50 p-2 rounded"
                      >
                        {suggestion.message}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setIsOpen(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleValidateAndCreate}
            disabled={
              !pendingShift ||
              isValidating ||
              (validationResult && !validationResult.ok)
            }
          >
            {isValidating ? "Validating..." : "Create Shift"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ConstraintAwareShiftDialog;
