import { NavLink } from "react-router-dom";
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import GoogleIntegration from "./GoogleIntegration/GoogleIntegration";
import ShiftsToAddToCal from "./ShiftsToAddToCal/ShiftsToAddToCall";

export default function Settings() {

  return (
    <div className="flex min-h-screen w-full flex-col">
      <main className="flex min-h-[calc(100vh_-_theme(spacing.16))] flex-1 flex-col gap-4 bg-muted/40 p-4 md:gap-8 md:p-10">
        <div className="mx-auto grid w-full max-w-6xl gap-2">
          <h1 className="text-3xl font-semibold">Settings</h1>
        </div>
        <div className="mx-auto grid w-full max-w-6xl items-start gap-6 md:grid-cols-[180px_1fr] lg:grid-cols-[250px_1fr]">
          <nav
            className="grid gap-4 text-sm text-muted-foreground" x-chunk="dashboard-04-chunk-0"
          >
            <NavLink to="#" className="font-semibold text-primary">
              Google Integration
            </NavLink>
            <NavLink to="#">Shifts on GCalendar</NavLink>
          </nav>
          <div className="grid gap-6">
            <GoogleIntegration></GoogleIntegration>
            <ShiftsToAddToCal></ShiftsToAddToCal>
          </div>
        </div>
      </main>
    </div>
  )
}
