import { NavLink } from "react-router-dom";
import { CircleUser, Menu, CalendarHeart, Sun, Moon } from "lucide-react"
import { useTheme } from "@/components/providers/theme-provider"
import { useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet"

const Header = () => {
    const { setTheme } = useTheme();
    const navigate = useNavigate();

    const logout = async () => {
        const response = await fetch('api/logout', {
            method: 'POST',
            mode: 'cors',
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json',
            },
        });
        if (response.ok) {
            navigate('/login');
        } else {
            console.error('Logout failed');
        }
    }

    return(
        <header className="sticky top-0 flex h-16 items-center gap-4 border-b bg-background px-4 md:px-6 z-50">
            <nav className="hidden flex-col gap-6 text-lg font-medium md:flex md:flex-row md:items-center md:gap-5 md:text-sm lg:gap-6">
                <NavLink
                    to="/home"
                    className="flex items-center gap-2 text-lg font-semibold md:text-base"
                >
                    <CalendarHeart className="h-6 w-6" />
                    <span className="sr-only">Acme Inc</span>
                </NavLink>
                <NavLink
                    to="/home"
                    className={({isActive}) => `${isActive ? 'text-foreground' : 'text-muted-foreground'} transition-colors hover:text-foreground`}
                >
                    Dashboard
                </NavLink>
                <NavLink
                    to="/settings"
                    className={({isActive}) => `${isActive ? 'text-foreground' : 'text-muted-foreground'} transition-colors hover:text-foreground`}
                >
                    Settings
                </NavLink>
            </nav>
            <Sheet>
                <SheetTrigger asChild>
                    <Button
                    variant="outline"
                    size="icon"
                    className="shrink-0 md:hidden"
                    >
                    <Menu className="h-5 w-5" />
                    <span className="sr-only">Toggle navigation menu</span>
                    </Button>
                </SheetTrigger>
                <SheetContent side="left">
                    <nav className="grid gap-6 text-lg font-medium">
                    <NavLink
                        to="#"
                        className="flex items-center gap-2 text-lg font-semibold"
                    >
                        <CalendarHeart className="h-6 w-6" />
                        <span className="sr-only">Acme Inc</span>
                    </NavLink>
                    <NavLink
                        to="#"
                        className="text-muted-foreground hover:text-foreground"
                    >
                        Dashboard
                    </NavLink>
                    <NavLink to="#" className="hover:text-foreground">
                        Settings
                    </NavLink>
                    </nav>
                </SheetContent>
            </Sheet>
            <div className="flex w-full items-center gap-4 md:ml-auto md:gap-2 lg:gap-4">
                <div id="theme-toggle" className="ml-auto">
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="outline" size="icon">
                            <Sun className="h-[1.2rem] w-[1.2rem] rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
                            <Moon className="absolute h-[1.2rem] w-[1.2rem] rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
                            <span className="sr-only">Toggle theme</span>
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => setTheme("light")}>
                            Light
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setTheme("dark")}>
                            Dark
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setTheme("system")}>
                            System
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                <Button variant="secondary" size="icon" className="rounded-full">
                    <CircleUser className="h-5 w-5" />
                    <span className="sr-only">Toggle user menu</span>
                </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                <DropdownMenuLabel>My Account</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem>Settings</DropdownMenuItem>
                <DropdownMenuItem>Support</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                    onClick={logout}
                >
                    Logout
                </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>
            </div>
        </header>
    )
}

export default Header;
