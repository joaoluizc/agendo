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
import {
  getDefaultEventColorId,
  getPositionsToSync,
  savePositionsToSync,
} from "./utils.tsx";
import { useSettings } from "@/providers/useSettings.tsx";
import { useUserSettings } from "@/providers/useUserSettings.tsx";
import { ApplyColorMenu } from "./ApplyColorMenu.tsx";

export default function ShiftsToAddToCal() {
  const { rowSelection } = useSettings();
  const {
    positionsToSync,
    setPositionsToSync,
    setOriginalPositionsToSync,
    setDefaultEventColorId,
  } = useUserSettings();

  useEffect(() => {
    async function getData() {
      const [positionsData, defaultColor] = await Promise.all([
        getPositionsToSync(),
        getDefaultEventColorId(),
      ]);
      setPositionsToSync(positionsData);
      setOriginalPositionsToSync(positionsData);
      setDefaultEventColorId(defaultColor);
    }
    getData();
  }, []);

  return (
    <Card className="scroll-mt-20" id="shifts-to-add-to-cal">
      <CardHeader className="flex flex-row items-start justify-between space-y-0">
        <div className="space-y-1.5">
          <CardTitle>Synced shifts</CardTitle>
          <CardDescription>
            Pick which shifts sync to your Google Calendar and the color each one
            gets. Only live channels and breaks are checked by default.
          </CardDescription>
        </div>
        <ApplyColorMenu />
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
