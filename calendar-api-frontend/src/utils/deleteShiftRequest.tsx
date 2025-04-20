// import { toast } from "sonner";

async function deleteShiftRequest(shiftId: string) {
  try {
    const response = await fetch(`/api/shift/delete?shiftId=${shiftId}`, {
      method: "POST",
      credentials: "include",
    });

    if (!response.ok) throw new Error("Failed to delete shift");

    //   setIsOpen(false);
    // reloadScheduleCalendar();
    // toast.success("Shift deleted successfully");
    //   setLoading(false);
  } catch (error) {
    //   setLoading(false);
    console.error("Error deleting shift:", error);
    // toast.error("Failed to delete shift");
    return false;
  }
  return true;
}

export default deleteShiftRequest;
