import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Trash2, Edit, Plus, MapPin, LoaderCircle, Users } from "lucide-react";
import utils from "./utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import { Location } from "@/types/locationTypes";
import { UserSafeInfo } from "@/types/userTypes";
import { useUserSettings } from "@/providers/useUserSettings";

export default function LocationManager() {
  const { allUsers: users } = useUserSettings();
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchLocations = async () => {
      const locations = await utils.getAllLocations();
      setLocations(locations);
      setLoading(false);
    };
    fetchLocations();
  }, []);

  const [newLocationName, setNewLocationName] = useState("");
  const [editingLocation, setEditingLocation] = useState<Location | null>(null);
  const [editName, setEditName] = useState("");
  const [isAddingLocation, setIsAddingLocation] = useState(false);
  const [editAssignedUsers, setEditAssignedUsers] = useState<string[]>([]);
  const [isLoadingAddingLocation, setIsLoadingAddingLocation] = useState(false);
  const [isLoadingDeletingLocation, setIsLoadingDeletingLocation] =
    useState(false);
  const [isLoadingEditingLocation, setIsLoadingEditingLocation] =
    useState(false);

  const getUserById = (userId: string) =>
    users.find((user) => user.id === userId);

  const getAssignedUsers = (location: Location) => {
    return location.assignedUsers
      .map((userId) => getUserById(userId))
      .filter(Boolean) as UserSafeInfo[];
  };

  // Create new location
  const handleCreateLocation = async () => {
    if (newLocationName.trim()) {
      setIsLoadingAddingLocation(true);
      const newLocation = await utils.createLocation(newLocationName.trim());
      if (newLocation) {
        setLocations([...locations, newLocation]);
      }
      setNewLocationName("");
      setIsAddingLocation(false);
      setIsLoadingAddingLocation(false);
    }
  };

  // Update existing location
  const handleUpdateLocation = async () => {
    if (editingLocation && editName.trim()) {
      setIsLoadingEditingLocation(true);
      const updatedLocation = await utils.updateLocation(
        editingLocation._id,
        editName.trim(),
        editAssignedUsers.map((userId) => userId.trim())
      );
      setIsLoadingEditingLocation(false);
      if (!updatedLocation) {
        console.error("Failed to update location");
        return;
      }
      setLocations(
        locations.map((location) =>
          location._id === editingLocation._id
            ? {
                ...location,
                name: editName.trim(),
                assignedUsers: editAssignedUsers.map((userId) => userId.trim()),
              }
            : location
        )
      );
      setEditingLocation(null); // Close dialog after successful update
      setEditName("");
    }
  };

  // Delete location
  const handleDeleteLocation = async (locationId: string) => {
    setIsLoadingDeletingLocation(true);
    const deletedLocation = await utils.deleteLocation(locationId);
    if (deletedLocation) {
      setLocations(locations.filter((location) => location._id !== locationId));
    }
    setIsLoadingDeletingLocation(false);
  };

  // Start editing
  const startEditing = (location: Location) => {
    setEditingLocation(location);
    setEditName(location.name);
    setEditAssignedUsers([...location.assignedUsers]);
  };

  const toggleUserAssignment = (userId: string) => {
    setEditAssignedUsers((prev) =>
      prev.includes(userId)
        ? prev.filter((id) => id !== userId)
        : [...prev, userId]
    );
  };

  return (
    <Card className="w-full max-w-4xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MapPin className="h-5 w-5" />
          Location Management
        </CardTitle>
        <CardDescription>
          Manage your organization's locations and assign users to each
          location.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Add New Location Section */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium">Add New Location</h3>
            {loading ? (
              <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Badge variant="secondary">{locations.length} locations</Badge>
            )}
          </div>

          {isAddingLocation ? (
            <div className="flex gap-2">
              <div className="flex-1">
                <Input
                  placeholder="Enter location name"
                  value={newLocationName}
                  onChange={(e) => setNewLocationName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      handleCreateLocation();
                    } else if (e.key === "Escape") {
                      setIsAddingLocation(false);
                      setNewLocationName("");
                    }
                  }}
                  autoFocus
                />
              </div>
              <Button
                onClick={handleCreateLocation}
                disabled={isLoadingAddingLocation || !newLocationName.trim()}
              >
                {isLoadingAddingLocation ? (
                  <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  "Add"
                )}
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setIsAddingLocation(false);
                  setNewLocationName("");
                }}
              >
                Cancel
              </Button>
            </div>
          ) : (
            <Button
              onClick={() => setIsAddingLocation(true)}
              className="w-full"
              variant="outline"
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Location
            </Button>
          )}
        </div>

        {/* Locations List */}
        <div className="space-y-3">
          <h3 className="text-sm font-medium">Current Locations</h3>

          {locations.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <MapPin className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>No locations added yet</p>
              <p className="text-sm">Add your first location to get started</p>
            </div>
          ) : (
            <div className="space-y-3">
              {locations.map((location) => {
                const assignedUsers = getAssignedUsers(location);
                return (
                  <div
                    key={location._id}
                    className="p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1 space-y-3">
                        <div className="flex items-center gap-3">
                          <MapPin className="h-4 w-4 text-muted-foreground" />
                          <span className="font-medium">{location.name}</span>
                        </div>

                        {/* Assigned Users */}
                        <div className="ml-7">
                          <div className="flex items-center gap-2 mb-2">
                            <Users className="h-3 w-3 text-muted-foreground" />
                            <span className="text-xs text-muted-foreground">
                              {assignedUsers.length} user
                              {assignedUsers.length !== 1 ? "s" : ""} assigned
                            </span>
                          </div>

                          {assignedUsers.length > 0 ? (
                            <div className="flex flex-wrap gap-2">
                              {assignedUsers.map((user) => (
                                <div
                                  key={user.id}
                                  className="flex items-center gap-2 bg-muted px-2 py-1 rounded-md"
                                >
                                  <Avatar className="h-5 w-5">
                                    <AvatarImage
                                      src={user.imageUrl || "/placeholder.svg"}
                                    />
                                    <AvatarFallback className="text-xs">
                                      {[user.firstName, user.lastName]
                                        .map((n) => n[0])
                                        .join("")}
                                    </AvatarFallback>
                                  </Avatar>
                                  <span className="text-xs">
                                    {user.firstName} {user.lastName}
                                  </span>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-xs text-muted-foreground">
                              No users assigned
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {/* Edit Dialog */}
                        <Dialog
                          open={editingLocation?._id === location._id}
                          onOpenChange={(open) => {
                            if (!open) {
                              setEditingLocation(null);
                              setEditName("");
                              setEditAssignedUsers([]);
                            }
                          }}
                        >
                          <DialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => startEditing(location)}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="max-w-md">
                            <DialogHeader>
                              <DialogTitle>Edit Location</DialogTitle>
                              <DialogDescription>
                                Update the location name and assign users.
                              </DialogDescription>
                            </DialogHeader>
                            <div className="space-y-6 py-4">
                              {/* Location Name */}
                              <div className="space-y-2">
                                <Label htmlFor="edit-name">Location Name</Label>
                                <Input
                                  id="edit-name"
                                  value={editName}
                                  onChange={(e) => setEditName(e.target.value)}
                                  placeholder="Enter location name"
                                />
                              </div>

                              <Separator />

                              {/* User Assignment */}
                              <div className="space-y-3">
                                <Label>Assign Users</Label>
                                <div className="space-y-3 max-h-48 overflow-y-auto">
                                  {users.map((user) => (
                                    <div
                                      key={user.id}
                                      className="flex items-center space-x-3"
                                    >
                                      <Checkbox
                                        id={`user-${user.id}`}
                                        checked={editAssignedUsers.includes(
                                          user.id
                                        )}
                                        onCheckedChange={() =>
                                          toggleUserAssignment(user.id)
                                        }
                                      />
                                      <div className="flex items-center gap-2 flex-1">
                                        <Avatar className="h-6 w-6">
                                          <AvatarImage
                                            src={
                                              user.imageUrl ||
                                              "/placeholder.svg"
                                            }
                                          />
                                          <AvatarFallback className="text-xs">
                                            {[user.firstName, user.lastName]
                                              .map((n) => n[0])
                                              .join("")}
                                          </AvatarFallback>
                                        </Avatar>
                                        <div className="flex-1">
                                          <p className="text-sm font-medium">
                                            {user.firstName} {user.lastName}
                                          </p>
                                          <p className="text-xs text-muted-foreground">
                                            {user.email || "No email assigned"}
                                          </p>
                                        </div>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                                <p className="text-xs text-muted-foreground">
                                  {editAssignedUsers.length} user
                                  {editAssignedUsers.length !== 1
                                    ? "s"
                                    : ""}{" "}
                                  selected
                                </p>
                              </div>
                            </div>
                            <DialogFooter>
                              <Button
                                variant="outline"
                                onClick={() => {
                                  setEditingLocation(null);
                                  setEditName("");
                                  setEditAssignedUsers([]);
                                }}
                              >
                                Cancel
                              </Button>
                              <Button
                                onClick={handleUpdateLocation}
                                disabled={
                                  isLoadingEditingLocation || !editName.trim()
                                }
                              >
                                {isLoadingEditingLocation ? (
                                  <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
                                ) : (
                                  "Save Changes"
                                )}
                              </Button>
                            </DialogFooter>
                          </DialogContent>
                        </Dialog>

                        {/* Delete Alert Dialog */}
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-destructive hover:text-destructive"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>
                                Delete Location
                              </AlertDialogTitle>
                              <AlertDialogDescription>
                                Are you sure you want to delete "{location.name}
                                "? This will unassign all users from this
                                location. This action cannot be undone.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <Button
                                onClick={() =>
                                  handleDeleteLocation(location._id)
                                }
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                disabled={isLoadingDeletingLocation}
                              >
                                {isLoadingDeletingLocation ? (
                                  <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
                                ) : (
                                  "Delete"
                                )}
                              </Button>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
