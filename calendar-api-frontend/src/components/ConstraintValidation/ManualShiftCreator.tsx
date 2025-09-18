import React, { useState, useEffect } from "react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { Textarea } from "../ui/textarea";
import { Badge } from "../ui/badge";
import { Alert, AlertDescription } from "../ui/alert";
import { Plus, X, Clock, User, Briefcase, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  demoDataService,
  DemoUser,
  DemoPosition,
} from "../../services/demoDataService";

interface ManualShift {
  id: string;
  userId: string;
  positionId: string;
  startTime: string;
  endTime: string;
  notes?: string;
}

interface ManualShiftCreatorProps {
  onShiftsChange: (shifts: ManualShift[]) => void;
  initialShifts?: ManualShift[];
}

const ManualShiftCreator: React.FC<ManualShiftCreatorProps> = ({
  onShiftsChange,
  initialShifts = [],
}) => {
  const [shifts, setShifts] = useState<ManualShift[]>(initialShifts);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState<Partial<ManualShift>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [users, setUsers] = useState<DemoUser[]>([]);
  const [positions, setPositions] = useState<DemoPosition[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    onShiftsChange(shifts);
  }, [shifts, onShiftsChange]);

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
        toast.error("Failed to load data, using fallback data");
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, []);

  const formatTime = (minutes: number) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours.toString().padStart(2, "0")}:${mins
      .toString()
      .padStart(2, "0")}`;
  };

  const getWorkHoursDisplay = (user: DemoUser) => {
    const workDays = user.workHours.filter((wh) => wh.isWorking);
    if (workDays.length === 0) return "No work hours";

    const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    return workDays
      .map(
        (day) =>
          `${dayNames[day.dayOfWeek]} ${formatTime(
            day.startMinute
          )}-${formatTime(day.endMinute)}`
      )
      .join(", ");
  };

  const handleAddShift = () => {
    if (
      !formData.userId ||
      !formData.positionId ||
      !formData.startTime ||
      !formData.endTime
    ) {
      toast.error("Please fill in all required fields");
      return;
    }

    const newShift: ManualShift = {
      id: editingId || `shift_${Date.now()}`,
      userId: formData.userId,
      positionId: formData.positionId,
      startTime: formData.startTime,
      endTime: formData.endTime,
      notes: formData.notes || "",
    };

    if (editingId) {
      setShifts(shifts.map((s) => (s.id === editingId ? newShift : s)));
      setEditingId(null);
    } else {
      setShifts([...shifts, newShift]);
    }

    setFormData({});
    setShowForm(false);
    toast.success(editingId ? "Shift updated" : "Shift added");
  };

  const handleEditShift = (shift: ManualShift) => {
    setFormData(shift);
    setEditingId(shift.id);
    setShowForm(true);
  };

  const handleDeleteShift = (id: string) => {
    setShifts(shifts.filter((s) => s.id !== id));
    toast.success("Shift deleted");
  };

  const handleCancel = () => {
    setFormData({});
    setEditingId(null);
    setShowForm(false);
  };

  const getSelectedUser = () => users.find((u) => u._id === formData.userId);
  const getSelectedPosition = () =>
    positions.find((p) => p._id === formData.positionId);

  const validateForm = () => {
    const user = getSelectedUser();
    const position = getSelectedPosition();

    if (!user || !position) return true;

    // Check if user has required skills
    const userSkillNames = user.skills.map((s) => s.name);
    const hasRequiredSkills = position.requiredSkills.every((skill) =>
      userSkillNames.includes(skill)
    );

    return hasRequiredSkills;
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5" />
            Manual Shift Creator
          </CardTitle>
          <CardDescription>
            Create shifts with realistic user and position data for testing
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin mr-2" />
              <span>Loading users and positions...</span>
            </div>
          ) : (
            <>
              <div className="flex gap-2 mb-4">
                <Button onClick={() => setShowForm(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Shift
                </Button>
                {shifts.length > 0 && (
                  <Button variant="outline" onClick={() => setShifts([])}>
                    Clear All
                  </Button>
                )}
              </div>

              {/* Shift Form */}
              {showForm && (
                <Card className="mb-4">
                  <CardHeader>
                    <CardTitle className="text-lg">
                      {editingId ? "Edit Shift" : "Create New Shift"}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* User Selection */}
                      <div className="space-y-2">
                        <Label htmlFor="userId">User *</Label>
                        <Select
                          value={formData.userId || ""}
                          onValueChange={(value) =>
                            setFormData({ ...formData, userId: value })
                          }
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select a user" />
                          </SelectTrigger>
                          <SelectContent>
                            {users.map((user) => (
                              <SelectItem key={user._id} value={user._id}>
                                <div className="flex flex-col">
                                  <span className="font-medium">
                                    {user.firstName} {user.lastName}
                                  </span>
                                  <span className="text-sm text-gray-500">
                                    {user.email}
                                  </span>
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {formData.userId && (
                          <div className="text-sm text-gray-600">
                            <div className="flex items-center gap-1 mb-1">
                              <User className="h-3 w-3" />
                              <span>
                                Skills:{" "}
                                {getSelectedUser()
                                  ?.skills.map((s) => s.name)
                                  .join(", ")}
                              </span>
                            </div>
                            <div className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              <span>
                                {getWorkHoursDisplay(getSelectedUser()!)}
                              </span>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Position Selection */}
                      <div className="space-y-2">
                        <Label htmlFor="positionId">Position *</Label>
                        <Select
                          value={formData.positionId || ""}
                          onValueChange={(value) =>
                            setFormData({ ...formData, positionId: value })
                          }
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select a position" />
                          </SelectTrigger>
                          <SelectContent>
                            {positions.map((position) => (
                              <SelectItem
                                key={position._id}
                                value={position._id}
                              >
                                <div className="flex flex-col">
                                  <span className="font-medium">
                                    {position.name}
                                  </span>
                                  <span className="text-sm text-gray-500">
                                    {position.type} • {position.minTime}-
                                    {position.maxTime}min
                                    {position.stress && " • Stress"}
                                  </span>
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {formData.positionId && (
                          <div className="text-sm text-gray-600">
                            <div className="flex items-center gap-1">
                              <Briefcase className="h-3 w-3" />
                              <span>
                                Required:{" "}
                                {getSelectedPosition()?.requiredSkills.join(
                                  ", "
                                )}
                              </span>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Start Time */}
                      <div className="space-y-2">
                        <Label htmlFor="startTime">Start Time *</Label>
                        <Input
                          id="startTime"
                          type="datetime-local"
                          value={formData.startTime || ""}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              startTime: e.target.value,
                            })
                          }
                        />
                      </div>

                      {/* End Time */}
                      <div className="space-y-2">
                        <Label htmlFor="endTime">End Time *</Label>
                        <Input
                          id="endTime"
                          type="datetime-local"
                          value={formData.endTime || ""}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              endTime: e.target.value,
                            })
                          }
                        />
                      </div>
                    </div>

                    {/* Notes */}
                    <div className="space-y-2">
                      <Label htmlFor="notes">Notes (Optional)</Label>
                      <Textarea
                        id="notes"
                        placeholder="Add any notes about this shift..."
                        value={formData.notes || ""}
                        onChange={(e) =>
                          setFormData({ ...formData, notes: e.target.value })
                        }
                      />
                    </div>

                    {/* Validation Warning */}
                    {formData.userId &&
                      formData.positionId &&
                      !validateForm() && (
                        <Alert>
                          <AlertDescription>
                            ⚠️ The selected user doesn't have all required
                            skills for this position. This will cause a SKILLS
                            violation during validation.
                          </AlertDescription>
                        </Alert>
                      )}

                    {/* Form Actions */}
                    <div className="flex gap-2">
                      <Button onClick={handleAddShift}>
                        {editingId ? "Update Shift" : "Add Shift"}
                      </Button>
                      <Button variant="outline" onClick={handleCancel}>
                        Cancel
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Shifts List */}
              {shifts.length > 0 && (
                <div className="space-y-2">
                  <h4 className="font-semibold">
                    Created Shifts ({shifts.length})
                  </h4>
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {shifts.map((shift) => {
                      const user = users.find((u) => u._id === shift.userId);
                      const position = positions.find(
                        (p) => p._id === shift.positionId
                      );

                      return (
                        <div
                          key={shift.id}
                          className="flex items-center justify-between p-3 border rounded"
                        >
                          <div className="flex items-center gap-3">
                            <Badge
                              style={{ backgroundColor: position?.color }}
                              className="text-white"
                            >
                              {position?.name}
                            </Badge>
                            <div>
                              <div className="font-medium">
                                {user?.firstName} {user?.lastName}
                              </div>
                              <div className="text-sm text-gray-600">
                                {new Date(shift.startTime).toLocaleString()} -{" "}
                                {new Date(shift.endTime).toLocaleString()}
                              </div>
                              {shift.notes && (
                                <div className="text-xs text-gray-500 mt-1">
                                  {shift.notes}
                                </div>
                              )}
                            </div>
                          </div>
                          <div className="flex gap-1">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleEditShift(shift)}
                            >
                              Edit
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleDeleteShift(shift.id)}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default ManualShiftCreator;
