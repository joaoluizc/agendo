import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { columns, Position } from "./columns";
import { DataTable } from "./data-table";
import { useEffect, useState } from "react";
import { getPositionsToSync, savePositionsToSync } from "./utils";
import { useSettings } from "@/providers/useSettings";

export default function ShiftsToAddToCal() {
    const [positions, setPositions] = useState<Position[]>([]);
    const { rowSelection } = useSettings();

    useEffect(() => {
        async function getData() {
            const positions = await getPositionsToSync();
            setPositions(positions);
        }
        getData();
    }, []);

    return (
        <Card x-chunk="dashboard-04-chunk-2">
            <CardHeader>
                <CardTitle>Shifts to add to Google Calendar</CardTitle>
                <CardDescription>
                    Choose the shifts you want synced to your Google Calendar. Only live channels and breaks are checked by default.
                </CardDescription>
            </CardHeader>
            <CardContent>
                <DataTable columns={columns} data={positions} />
            </CardContent>
            <CardFooter className="border-t px-6 py-4">
                <Button onClick={() => savePositionsToSync(rowSelection)}>Save</Button>
            </CardFooter>
        </Card>
    )
}
