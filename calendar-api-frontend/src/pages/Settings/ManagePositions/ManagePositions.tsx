import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Plus, Edit, Trash2 } from "lucide-react";
import { useUserSettings } from "@/providers/useUserSettings";
import { Position } from "@/types/positionTypes";
import { Skill } from "@/types/skillTypes";
import {
  createPosition,
  deletePosition,
  updatePosition,
} from "./positionUtils";
import { getAllSkills } from "./skillUtils";
import { toast } from "sonner";

const POSITION_TYPES = [
  "live channel",
  "tickets",
  "meeting",
  "break",
  "development",
  "training",
];

const DEFAULT_COLORS = [
  "#3B82F6",
  "#EF4444",
  "#10B981",
  "#F59E0B",
  "#8B5CF6",
  "#EC4899",
  "#06B6D4",
  "#84CC16",
];

export default function ManagePositions() {
  const { allPositions, setAllPositions } = useUserSettings();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingPosition, setEditingPosition] = useState<Position | null>(null);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [formData, setFormData] = useState({
    name: "",
    color: DEFAULT_COLORS[0],
    type: "live channel" as Position["type"],
    positionId: "",
    minTime: 30,
    maxTime: 480,
    stress: false,
    requiredSkills: [] as string[],
  });

  // Load skills on component mount
  useEffect(() => {
    const loadSkills = async () => {
      try {
        const skillsData = await getAllSkills();
        setSkills(skillsData);
      } catch (error) {
        console.error("Error loading skills:", error);
        toast.error("Failed to load skills");
      }
    };
    loadSkills();
  }, []);

  const resetForm = () => {
    setFormData({
      name: "",
      color: DEFAULT_COLORS[0],
      type: "live channel",
      positionId: "",
      minTime: 30,
      maxTime: 480,
      stress: false,
      requiredSkills: [],
    });
  };

  const handleSkillToggle = (skillId: string) => {
    setFormData((prev) => ({
      ...prev,
      requiredSkills: prev.requiredSkills.includes(skillId)
        ? prev.requiredSkills.filter((id) => id !== skillId)
        : [...prev.requiredSkills, skillId],
    }));
  };

  const formatTime = (minutes: number) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}h ${mins}m`;
  };

  const handleCreate = async () => {
    const newPosition = {
      name: formData.name,
      color: formData.color,
      type: formData.type,
      minTime: formData.minTime,
      maxTime: formData.maxTime,
      stress: formData.stress,
      requiredSkills: formData.requiredSkills,
      ...(formData.positionId && { positionID: formData.positionId }),
    };

    try {
      const createdPosition = await createPosition(newPosition);
      setAllPositions([...allPositions, createdPosition]);
      setIsCreateDialogOpen(false);
      resetForm();
      toast.success("Position created successfully.");
    } catch (error) {
      console.error("Error creating position:", error);
      toast.error("Failed to create position.");
    }
  };

  const handleEdit = (position: Position) => {
    setEditingPosition(position);
    setFormData({
      name: position.name,
      color: position.color,
      type: position.type,
      positionId: position.positionId || "",
      minTime: position.minTime || 30,
      maxTime: position.maxTime || 480,
      stress: position.stress || false,
      requiredSkills: position.requiredSkills || [],
    });
    setIsEditDialogOpen(true);
  };

  const handleUpdate = async () => {
    if (!editingPosition) return;

    const updatedPosition: Position = {
      ...editingPosition,
      name: formData.name,
      color: formData.color,
      type: formData.type,
      minTime: formData.minTime,
      maxTime: formData.maxTime,
      stress: formData.stress,
      requiredSkills: formData.requiredSkills,
      ...(formData.positionId && { positionId: formData.positionId }),
    };

    try {
      await updatePosition(updatedPosition);
      console.log("Updating position:", updatedPosition);
      setAllPositions(
        allPositions.map((p) => {
          if (p._id === editingPosition._id) {
            console.log("Position matched for update:", p);
            return updatedPosition;
          }
          return p;
        })
      );
      console.log(
        "All positions after update:",
        allPositions.map((p) => ({ _id: p._id, name: p.name, color: p.color }))
      );
      setIsEditDialogOpen(false);
      setEditingPosition(null);
      resetForm();
      toast.success("Position updated successfully.");
    } catch (error) {
      console.error("Error updating position:", error);
      toast.error("Failed to update position.");
    }
  };

  const handleDelete = (positionId: string) => {
    try {
      deletePosition(positionId);
      setAllPositions(allPositions.filter((p) => p._id !== positionId));
      toast.success("Position deleted successfully.");
    } catch (error) {
      console.error("Error deleting position:", error);
      toast.error("Failed to delete position.");
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Positions Management</CardTitle>
            <CardDescription>
              Manage support agent positions and their assignments
            </CardDescription>
          </div>
          <Dialog
            open={isCreateDialogOpen}
            onOpenChange={setIsCreateDialogOpen}
          >
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Add Position
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[90vh] overflow-hidden flex flex-col">
              <DialogHeader>
                <DialogTitle>Create New Position</DialogTitle>
                <DialogDescription>
                  Add a new position for support agents
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4 overflow-y-auto flex-1">
                <div className="grid gap-2">
                  <Label htmlFor="name">Position Name</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) =>
                      setFormData({ ...formData, name: e.target.value })
                    }
                    placeholder="e.g., Live Chat Support"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="type">Position Type</Label>
                  <Select
                    value={formData.type}
                    onValueChange={(value: Position["type"]) =>
                      setFormData({ ...formData, type: value })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {POSITION_TYPES.map((type, idx) => (
                        <SelectItem
                          className="capitalize"
                          key={`${type}-${idx}`}
                          value={type}
                        >
                          {type}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="color">Color</Label>
                  <div className="flex gap-2 flex-wrap">
                    {DEFAULT_COLORS.map((color) => (
                      <button
                        key={color}
                        type="button"
                        className={`w-8 h-8 rounded-full border-2 ${
                          formData.color === color
                            ? "border-gray-900"
                            : "border-gray-300"
                        }`}
                        style={{ backgroundColor: color }}
                        onClick={() => setFormData({ ...formData, color })}
                      />
                    ))}
                  </div>
                  <Input
                    type="color"
                    value={formData.color}
                    onChange={(e) =>
                      setFormData({ ...formData, color: e.target.value })
                    }
                    className="w-20 h-10"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="positionId">
                    Legacy Position ID (Optional)
                  </Label>
                  <Input
                    id="positionId"
                    value={formData.positionId}
                    onChange={(e) =>
                      setFormData({ ...formData, positionId: e.target.value })
                    }
                    placeholder="e.g., SLING_001"
                  />
                  <p className="text-sm text-muted-foreground">
                    Enter the legacy ID if this position exists in Sling
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="minTime">Minimum Time (minutes)</Label>
                    <Input
                      id="minTime"
                      type="number"
                      min="1"
                      value={formData.minTime}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          minTime: parseInt(e.target.value) || 30,
                        })
                      }
                      placeholder="30"
                    />
                    <p className="text-sm text-muted-foreground">
                      {formatTime(formData.minTime)}
                    </p>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="maxTime">Maximum Time (minutes)</Label>
                    <Input
                      id="maxTime"
                      type="number"
                      min="1"
                      value={formData.maxTime}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          maxTime: parseInt(e.target.value) || 480,
                        })
                      }
                      placeholder="480"
                    />
                    <p className="text-sm text-muted-foreground">
                      {formatTime(formData.maxTime)}
                    </p>
                  </div>
                </div>
                <div className="grid gap-2">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="stress"
                      checked={formData.stress}
                      onCheckedChange={(checked) =>
                        setFormData({ ...formData, stress: checked as boolean })
                      }
                    />
                    <Label htmlFor="stress">High Stress Position</Label>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Mark this position as high stress for workload management
                  </p>
                </div>
                <div className="grid gap-2">
                  <Label>Required Skills</Label>
                  <div className="grid grid-cols-2 gap-2 max-h-32 overflow-y-auto border rounded-md p-2">
                    {skills.map((skill) => (
                      <div
                        key={skill._id}
                        className="flex items-center space-x-2"
                      >
                        <Checkbox
                          id={`skill-${skill._id}`}
                          checked={formData.requiredSkills.includes(skill._id)}
                          onCheckedChange={() => handleSkillToggle(skill._id)}
                        />
                        <Label
                          htmlFor={`skill-${skill._id}`}
                          className="text-sm"
                        >
                          {skill.name}
                        </Label>
                      </div>
                    ))}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Select the skills required for this position
                  </p>
                </div>
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setIsCreateDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button onClick={handleCreate} disabled={!formData.name.trim()}>
                  Create Position
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Color</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Stress</TableHead>
              <TableHead>Skills</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {allPositions.map((position) => (
              <TableRow key={position._id}>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <div
                      className="w-4 h-4 rounded-full border"
                      style={{ backgroundColor: position.color }}
                    />
                  </div>
                </TableCell>
                <TableCell className="font-medium">{position.name}</TableCell>
                <TableCell className="capitalize">{position.type}</TableCell>
                <TableCell>
                  {position.stress ? (
                    <Badge variant="destructive" className="text-xs">
                      High Stress
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="text-xs">
                      Normal
                    </Badge>
                  )}
                </TableCell>
                <TableCell>
                  {position.requiredSkills &&
                  position.requiredSkills.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {position.requiredSkills.slice(0, 2).map((skillId) => {
                        const skill = skills.find((s) => s._id === skillId);
                        return skill ? (
                          <Badge
                            key={skillId}
                            variant="outline"
                            className="text-xs"
                          >
                            {skill.name}
                          </Badge>
                        ) : null;
                      })}
                      {position.requiredSkills.length > 2 && (
                        <Badge variant="outline" className="text-xs">
                          +{position.requiredSkills.length - 2} more
                        </Badge>
                      )}
                    </div>
                  ) : (
                    <span className="text-muted-foreground text-sm">None</span>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleEdit(position)}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="outline" size="sm">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete Position</AlertDialogTitle>
                          <AlertDialogDescription>
                            Are you sure you want to delete "{position.name}"?
                            This action cannot be undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => handleDelete(position._id)}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          >
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        {allPositions.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            No positions found. Create your first position to get started.
          </div>
        )}

        {/* Edit Dialog */}
        <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
          <DialogContent className="max-h-[90vh] overflow-hidden flex flex-col">
            <DialogHeader>
              <DialogTitle>Edit Position</DialogTitle>
              <DialogDescription>Update the position details</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4 overflow-y-auto flex-1">
              <div className="grid gap-2">
                <Label htmlFor="edit-name">Position Name</Label>
                <Input
                  id="edit-name"
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                  placeholder="e.g., Live Chat Support"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-type">Position Type</Label>
                <Select
                  value={formData.type}
                  onValueChange={(value: Position["type"]) =>
                    setFormData({ ...formData, type: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {POSITION_TYPES.map((type, idx) => (
                      <SelectItem
                        className="capitalize"
                        key={`${type}-${idx}`}
                        value={type}
                      >
                        {type}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-color">Color</Label>
                <div className="flex gap-2 flex-wrap">
                  {DEFAULT_COLORS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      className={`w-8 h-8 rounded-full border-2 ${
                        formData.color === color
                          ? "border-gray-900"
                          : "border-gray-300"
                      }`}
                      style={{ backgroundColor: color }}
                      onClick={() => setFormData({ ...formData, color })}
                    />
                  ))}
                </div>
                <Input
                  type="color"
                  value={formData.color}
                  onChange={(e) =>
                    setFormData({ ...formData, color: e.target.value })
                  }
                  className="w-20 h-10"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-positionID">
                  Legacy Position ID (Optional)
                </Label>
                <Input
                  id="edit-positionID"
                  value={formData.positionId}
                  onChange={(e) =>
                    setFormData({ ...formData, positionId: e.target.value })
                  }
                  placeholder="e.g., SLING_001"
                />
                <p className="text-sm text-muted-foreground">
                  Enter the legacy ID if this position exists in Sling
                </p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="edit-minTime">Minimum Time (minutes)</Label>
                  <Input
                    id="edit-minTime"
                    type="number"
                    min="1"
                    value={formData.minTime}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        minTime: parseInt(e.target.value) || 30,
                      })
                    }
                    placeholder="30"
                  />
                  <p className="text-sm text-muted-foreground">
                    {formatTime(formData.minTime)}
                  </p>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="edit-maxTime">Maximum Time (minutes)</Label>
                  <Input
                    id="edit-maxTime"
                    type="number"
                    min="1"
                    value={formData.maxTime}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        maxTime: parseInt(e.target.value) || 480,
                      })
                    }
                    placeholder="480"
                  />
                  <p className="text-sm text-muted-foreground">
                    {formatTime(formData.maxTime)}
                  </p>
                </div>
              </div>
              <div className="grid gap-2">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="edit-stress"
                    checked={formData.stress}
                    onCheckedChange={(checked) =>
                      setFormData({ ...formData, stress: checked as boolean })
                    }
                  />
                  <Label htmlFor="edit-stress">High Stress Position</Label>
                </div>
                <p className="text-sm text-muted-foreground">
                  Mark this position as high stress for workload management
                </p>
              </div>
              <div className="grid gap-2">
                <Label>Required Skills</Label>
                <div className="grid grid-cols-2 gap-2 max-h-32 overflow-y-auto border rounded-md p-2">
                  {skills.map((skill) => (
                    <div
                      key={skill._id}
                      className="flex items-center space-x-2"
                    >
                      <Checkbox
                        id={`edit-skill-${skill._id}`}
                        checked={formData.requiredSkills.includes(skill._id)}
                        onCheckedChange={() => handleSkillToggle(skill._id)}
                      />
                      <Label
                        htmlFor={`edit-skill-${skill._id}`}
                        className="text-sm"
                      >
                        {skill.name}
                      </Label>
                    </div>
                  ))}
                </div>
                <p className="text-sm text-muted-foreground">
                  Select the skills required for this position
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setIsEditDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button onClick={handleUpdate} disabled={!formData.name.trim()}>
                Update Position
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
