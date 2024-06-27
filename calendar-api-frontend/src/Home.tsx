import ShiftsCalendar from "./components/widgets/ShiftsCalendar";
import { Input } from "./components/ui/input";
import { Label } from "@radix-ui/react-label";
import Schedule from "./ShiftsTest";

const Home = () => {
    return (
        <div className="p-5">
            <div id="app flex flex-col gap-5 h-96">
                <h1>Shift display</h1>
                <Label htmlFor="date">
                    <Input id="date" className="md:w-1/4" placeholder="Click here to select date" />
                </Label>
                <div id="all-shifts"></div>
            </div>
            <Schedule />
            {/* <ShiftsCalendar /> */}
        </div>
    )
}

export default Home;