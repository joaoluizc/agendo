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
import { Trash2, Edit, Plus, MapPin, LoaderCircle } from "lucide-react";
import utils from "./utils";

interface Location {
  _id: string;
  name: string;
}

export default function LocationManager() {
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
  const [isLoadingAddingLocation, setIsLoadingAddingLocation] = useState(false);
  const [isLoadingDeletingLocation, setIsLoadingDeletingLocation] =
    useState(false);
  const [openDeleteDialogId, setOpenDeleteDialogId] = useState<string | null>(
    null
  );
  const [isLoadingEditingLocation, setIsLoadingEditingLocation] =
    useState(false);

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
        editName.trim()
      );
      setIsLoadingEditingLocation(false);
      if (!updatedLocation) {
        console.error("Failed to update location");
        return;
      }
      setLocations(
        locations.map((location) =>
          location._id === editingLocation._id
            ? { ...location, name: editName.trim() }
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
      setOpenDeleteDialogId(null); // Close dialog only after delete
    }
    setIsLoadingDeletingLocation(false);
  };

  // Start editing
  const startEditing = (location: Location) => {
    setEditingLocation(location);
    setEditName(location.name);
  };

  return (
    <Card className="w-full" id="manage-locations">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MapPin className="h-5 w-5" />
          Location Management
        </CardTitle>
        <CardDescription>
          Manage your organization's locations. Add, edit, or remove locations
          as needed.
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
                disabled={
                  isLoadingAddingLocation ? true : !newLocationName.trim()
                }
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
            <div className="space-y-2">
              {locations.map((location) => (
                <div
                  key={location._id}
                  className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <MapPin className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">{location.name}</span>
                  </div>

                  <div className="flex items-center gap-2">
                    {/* Edit Dialog */}
                    <Dialog
                      open={editingLocation?._id === location._id}
                      onOpenChange={(open) => {
                        if (!open) {
                          setEditingLocation(null);
                          setEditName("");
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
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Edit Location</DialogTitle>
                          <DialogDescription>
                            Update the name of this location.
                          </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4 py-4">
                          <div className="space-y-2">
                            <Label htmlFor="edit-name">Location Name</Label>
                            <Input
                              id="edit-name"
                              value={editName}
                              onChange={(e) => setEditName(e.target.value)}
                              placeholder="Enter location name"
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  handleUpdateLocation();
                                } else if (e.key === "Escape") {
                                  setEditingLocation(null);
                                  setEditName("");
                                }
                              }}
                            />
                          </div>
                        </div>
                        <DialogFooter>
                          <Button
                            variant="outline"
                            onClick={() => {
                              setEditingLocation(null);
                              setEditName("");
                            }}
                            disabled={isLoadingEditingLocation}
                          >
                            Cancel
                          </Button>
                          <Button
                            onClick={handleUpdateLocation}
                            disabled={
                              !editName.trim() || isLoadingEditingLocation
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
                    <AlertDialog
                      open={openDeleteDialogId === location._id}
                      onOpenChange={(open) => {
                        if (!isLoadingDeletingLocation) {
                          setOpenDeleteDialogId(open ? location._id : null);
                        }
                      }}
                    >
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive"
                          onClick={() => setOpenDeleteDialogId(location._id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete Location</AlertDialogTitle>
                          <AlertDialogDescription>
                            Are you sure you want to delete "{location.name}"?
                            This action cannot be undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel
                            disabled={isLoadingDeletingLocation}
                            onClick={() => setOpenDeleteDialogId(null)}
                          >
                            Cancel
                          </AlertDialogCancel>
                          <Button
                            onClick={() => handleDeleteLocation(location._id)}
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
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
