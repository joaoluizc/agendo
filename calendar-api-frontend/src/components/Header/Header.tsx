import { Link, NavLink } from "react-router-dom";
import { Clock, Menu, Sun, Moon } from "lucide-react";
import { useTheme } from "../../providers/useTheme";
import { useUserSettings } from "@/providers/useUserSettings";
import { TimeFormatPreference, useTimeFormat } from "@/utils/timeFormat";
import agendoLogoLight from "../../resources/agendo-logo.svg";
import agendoLogoDark from "../../resources/agendo-logo-dark.svg";
import agendoAudio from "../../resources/agendo.mp3";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { SignedIn, SignedOut, UserButton } from "@clerk/clerk-react";
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
  navigationMenuTriggerStyle,
} from "../ui/navigation-menu";
import { NavigationMenuItem } from "@radix-ui/react-navigation-menu";
import React, { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

const IS_LOCALHOST = import.meta.env.DEV;

const TIME_FORMATS: { value: TimeFormatPreference; label: string }[] = [
  { value: "auto", label: "Auto" },
  { value: "24h", label: "24-hour" },
  { value: "12h", label: "12-hour (AM/PM)" },
];

const Header = () => {
  const { setTheme, theme } = useTheme();
  const { type } = useUserSettings();
  const {
    preference: timeFormat,
    setPreference: setTimeFormat,
    browserHour12,
  } = useTimeFormat();
  const logoRef = useRef(null);
  const [nrOfLogoClicks, setNrOfLogoClicks] = useState<number>(0);

  const setSiteTheme = (theme: string) => {
    if (theme === "light") {
      setTheme("light");
    } else if (theme === "dark") {
      setTheme("dark");
    } else {
      setTheme("system");
    }
  };

  const runLogoClick = () => {
    setNrOfLogoClicks((prevClicks) => {
      const newClicks = prevClicks + 1;
      if (newClicks >= 5) {
        console.log(nrOfLogoClicks);
        const agendoLogoElement = document.getElementById("agendo-logo");
        if (agendoLogoElement) {
          agendoLogoElement.style.transition = "transform 0.5s ease-in-out";
          agendoLogoElement.style.transform = "rotate(360deg)";
          setTimeout(() => {
            agendoLogoElement.style.transform = "rotate(0deg)";
          }, 500);
        }
        const audio = new Audio(agendoAudio);
        audio.play();
        return 0;
      }
      return newClicks;
    });
    setTimeout(() => {
      setNrOfLogoClicks(0);
    }, 5000);
  };

  useEffect(() => {
    if (logoRef.current) {
      const agendoLogoElement = document.getElementById("agendo-logo");
      agendoLogoElement?.addEventListener("click", runLogoClick);
    }
  }, []);

  return (
    <>
      <header
        className={cn(
          "sticky top-0 flex h-16 items-center gap-4 border-b bg-background px-4 md:px-6 z-50",
          IS_LOCALHOST && "bg-red-500 dark:bg-red-900"
        )}
      >
        <NavigationMenu className="hidden md:flex gap-4 items-center flex-1">
          <NavigationMenuList>
            <NavigationMenuItem>
              <div
                className="flex items-center gap-2 text-lg font-semibold md:text-base h-6 w-6 mr-3"
                ref={logoRef}
                id="agendo-logo"
              >
                <div
                  className={`group inline-flex h-6 w-6 items-center justify-center rounded-md px-0.5 py-0.5 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground focus:outline-none disabled:pointer-events-none disabled:opacity-50 data-[active]:bg-accent/50 data-[state=open]:bg-accent/50`}
                >
                  <img
                    src={theme === "light" ? agendoLogoDark : agendoLogoLight}
                  />
                  <span className="sr-only">Agendo</span>
                </div>
              </div>
            </NavigationMenuItem>
            <NavigationMenuItem>
              <NavLink
                to="/"
                className={({ isActive }) =>
                  `${
                    isActive ? "text-foreground" : "text-muted-foreground"
                  } transition-colors hover:text-foreground`
                }
              >
                <NavigationMenuLink className={navigationMenuTriggerStyle()}>
                  Home
                </NavigationMenuLink>
              </NavLink>
            </NavigationMenuItem>

            <SignedIn>
              <NavigationMenuItem>
                <NavigationMenuTrigger
                  onPointerMove={(e) => e.preventDefault()}
                >
                  Schedule
                </NavigationMenuTrigger>
                <NavigationMenuContent>
                  <ul className="grid w-[400px] gap-3 p-4 md:w-[500px] md:grid-cols-2">
                    <ListItem href="/app/schedule" title="Agendo">
                      See shifts made entirely in Agendo
                    </ListItem>
                    <li>
                      <ListItem href="/app/sling-schedule" title="Sling">
                        See shifts made in the old-fashioned Sling
                      </ListItem>
                    </li>
                  </ul>
                </NavigationMenuContent>
              </NavigationMenuItem>
              <NavigationMenuItem>
                <NavLink
                  to="/app/settings"
                  className={({ isActive }) =>
                    `${
                      isActive ? "text-foreground" : "text-muted-foreground"
                    } transition-colors hover:text-foreground`
                  }
                >
                  <NavigationMenuLink className={navigationMenuTriggerStyle()}>
                    Settings
                  </NavigationMenuLink>
                </NavLink>
              </NavigationMenuItem>
              {type === "admin" && (
                <>
                  <NavigationMenuItem>
                    <NavLink
                      to="/app/jira-backlog"
                      className={({ isActive }) =>
                        `${
                          isActive ? "text-foreground" : "text-muted-foreground"
                        } transition-colors hover:text-foreground`
                      }
                    >
                      <NavigationMenuLink className={navigationMenuTriggerStyle()}>
                        Bug Tracker
                      </NavigationMenuLink>
                    </NavLink>
                  </NavigationMenuItem>
                  <NavigationMenuItem>
                    <NavLink
                      to="/app/tasks"
                      className={({ isActive }) =>
                        `${
                          isActive ? "text-foreground" : "text-muted-foreground"
                        } transition-colors hover:text-foreground`
                      }
                    >
                      <NavigationMenuLink className={navigationMenuTriggerStyle()}>
                        Bug Tasks
                      </NavigationMenuLink>
                    </NavLink>
                  </NavigationMenuItem>
                  <NavigationMenuItem>
                    <NavLink
                      to="/app/reports"
                      className={({ isActive }) =>
                        `${
                          isActive ? "text-foreground" : "text-muted-foreground"
                        } transition-colors hover:text-foreground`
                      }
                    >
                      <NavigationMenuLink className={navigationMenuTriggerStyle()}>
                        Reports
                      </NavigationMenuLink>
                    </NavLink>
                  </NavigationMenuItem>
                </>
              )}
            </SignedIn>
          </NavigationMenuList>
        </NavigationMenu>
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
                className="flex items-center gap-2 text-lg font-semibold h-6 w-6"
              >
                <img
                  src={theme === "light" ? agendoLogoDark : agendoLogoLight}
                />
                <span className="sr-only">Agendo</span>
              </NavLink>
              <NavLink
                to="/"
                className="text-muted-foreground hover:text-foreground"
              >
                Home
              </NavLink>
              <NavLink
                to="/app/sling-schedule"
                className="text-muted-foreground hover:text-foreground"
              >
                Sling Schedule
              </NavLink>
              <SignedIn>
                <NavLink
                  to="/app/schedule"
                  className="text-muted-foreground hover:text-foreground"
                >
                  Schedule
                </NavLink>
                <NavLink to="/app/settings" className="hover:text-foreground">
                  Settings
                </NavLink>
                {type === "admin" && (
                  <>
                    <NavLink to="/app/jira-backlog" className="text-muted-foreground hover:text-foreground">
                      Bug Tracker
                    </NavLink>
                    <NavLink to="/app/tasks" className="text-muted-foreground hover:text-foreground">
                      Bug Tasks
                    </NavLink>
                    <NavLink to="/app/reports" className="text-muted-foreground hover:text-foreground">
                      Reports
                    </NavLink>
                  </>
                )}
              </SignedIn>
            </nav>
          </SheetContent>
        </Sheet>
        <div className="flex w-fit items-center gap-4 md:ml-auto md:gap-2 lg:gap-4">
          {IS_LOCALHOST && (
            <span className="rounded-md bg-white px-2 py-1 text-xs font-bold uppercase tracking-wide text-red-700 shadow-sm dark:bg-black dark:text-red-300">
              localhost
            </span>
          )}
          <SignedIn>
            <UserButton />
          </SignedIn>
          <SignedOut>
            <Link to="/login">
              <Button
                variant="default"
                className="self-start justify-self-start"
              >
                Sign In
              </Button>
            </Link>
          </SignedOut>
          {/* How the app looks, which now includes how it writes a clock time — both are
              this browser's own display preferences, so they share one menu. The clock on
              the icon is what says the time format lives here too. */}
          <div id="theme-toggle" className="ml-auto">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" className="relative">
                  <Sun className="h-[1.2rem] w-[1.2rem] rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
                  <Moon className="absolute h-[1.2rem] w-[1.2rem] rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
                  {/* `!size` because Button pins every icon inside it to 16px, and
                      `bg-inherit` takes the button's own fill — hover included — so the badge
                      reads as cut out of the sun rather than pasted on it. */}
                  <Clock
                    aria-hidden="true"
                    strokeWidth={2.5}
                    className="absolute bottom-[4px] right-[4px] !size-[10px] rounded-full bg-inherit"
                  />
                  <span className="sr-only">Theme and time format</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="text-xs text-muted-foreground">
                  Theme
                </DropdownMenuLabel>
                <DropdownMenuRadioGroup value={theme} onValueChange={setSiteTheme}>
                  <DropdownMenuRadioItem value="light">Light</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="dark">Dark</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="system">System</DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="text-xs text-muted-foreground">
                  Time format
                </DropdownMenuLabel>
                <DropdownMenuRadioGroup
                  value={timeFormat}
                  onValueChange={(value) =>
                    setTimeFormat(value as TimeFormatPreference)
                  }
                >
                  {TIME_FORMATS.map((option) => (
                    <DropdownMenuRadioItem key={option.value} value={option.value}>
                      {option.label}
                      {/* Says what "auto" resolved to, so choosing it is never a surprise. */}
                      {option.value === "auto" && (
                        <span className="ml-1 text-muted-foreground">
                          (browser: {browserHour12 ? "12-hour" : "24-hour"})
                        </span>
                      )}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>
    </>
  );
};

const ListItem = React.forwardRef<
  React.ElementRef<"a">,
  React.ComponentPropsWithoutRef<"a">
>(({ className, title, children, ...props }, ref) => {
  return (
    <li>
      <NavigationMenuLink asChild>
        <a
          ref={ref}
          className={cn(
            "block select-none space-y-1 rounded-md p-3 leading-none no-underline outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground",
            className
          )}
          {...props}
        >
          <div className="text-sm font-medium leading-none">{title}</div>
          <p className="line-clamp-2 text-sm leading-snug text-muted-foreground">
            {children}
          </p>
        </a>
      </NavigationMenuLink>
    </li>
  );
});
ListItem.displayName = "ListItem";

export default Header;
