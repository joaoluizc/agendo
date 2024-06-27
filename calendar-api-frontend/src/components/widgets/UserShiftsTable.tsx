import { Shift, User } from '../../types/slingTypes'
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
  } from "@/components/ui/table"

interface UserShiftsTableProps {
    shifts: Shift[],
    positions: { [key: string]: string },
    user: User,
}

const UserShiftsTable = ({ user, shifts, positions }: UserShiftsTableProps ) => {
    // console.log(user, shifts, positions);
    if (!shifts.length) return (<p>No shifts</p>);
    return (
        <>
            <h3>{`${user.legalName} ${user.lastname}'s shifts`}</h3>
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>Start</TableHead>
                        <TableHead>End</TableHead>
                        <TableHead>Position</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {shifts.map((shift, index) => (
                        <TableRow key={index}>
                            <TableCell>{`${new Date(shift.dtstart).getHours().toLocaleString('en-US', { minimumIntegerDigits: 2})}:${new Date(shift.dtstart).getMinutes().toLocaleString('en-US', { minimumIntegerDigits: 2})}`}</TableCell>
                            <TableCell>{`${new Date(shift.dtend).getHours().toLocaleString('en-US', { minimumIntegerDigits: 2})}:${new Date(shift.dtend).getMinutes().toLocaleString('en-US', { minimumIntegerDigits: 2})}`}</TableCell>
                            <TableCell>{positions[shift.position.id]}</TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </>
    );
}

export default UserShiftsTable;