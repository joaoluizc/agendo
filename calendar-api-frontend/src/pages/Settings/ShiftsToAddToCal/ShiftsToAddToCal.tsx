import { Button } from "@/components/ui/button.tsx";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.tsx";
import { columns } from "./columns.tsx";
import { DataTable } from "./data-table.tsx";
import { useEffect } from "react";
import { getPositionsToSync, savePositionsToSync } from "./utils.tsx";
import { useSettings } from "@/providers/useSettings.tsx";
import { useUserSettings } from "@/providers/useUserSettings.tsx";

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
