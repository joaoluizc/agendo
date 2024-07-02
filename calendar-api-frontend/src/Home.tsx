import ShiftsCalendar from "./components/widgets/ShiftsCalendar";
import { Input } from "./components/ui/input";
import { Label } from "@radix-ui/react-label";
import GoogleAppAuth from "./components/widgets/GoogleAppAuth";
import Schedule from "./components/widgets/Schedule";

const Home = () => {
    return (
        <div className="p-5">
            <GoogleAppAuth />
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