import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { columns } from "./columns";
import { DataTable } from "./data-table";
import { useEffect } from "react";
import { getPositionsToSync, savePositionsToSync } from "./utils";
import { useSettings } from "@/providers/useSettings";
import { useUserSettings } from "@/providers/useUserSettings";

export default function ShiftsToAddToCal() {
  const { rowSelection } = useSettings();
  const { positionsToSync, setPositionsToSync, setOriginalPositionsToSync } =
    useUserSettings();

  useEffect(() => {
    async function getData() {
      const positionsData = await getPositionsToSync();
      setPositionsToSync(positionsData);
      setOriginalPositionsToSync(positionsData);
    }
    getData();
  }, []);

  // const handleSave = async () => {
  //     await savePositionsToSync(rowSelection, positionsToSync);
  //     setInitialPositions(positionsToSync);
  // };

  return (
    <Card className="scroll-mt-20" id="shifts-to-add-to-cal">
      <CardHeader>
        <CardTitle>Shifts to add to Google Calendar</CardTitle>
        <CardDescription>
          Choose the shifts you want synced to your Google Calendar. Only live
          channels and breaks are checked by default.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <DataTable columns={columns} data={positionsToSync} />
      </CardContent>
      <CardFooter className="border-t px-6 py-4">
        <Button
          onClick={() => savePositionsToSync(rowSelection, positionsToSync)}
        >
          Save
        </Button>
      </CardFooter>
    </Card>
  );
}
