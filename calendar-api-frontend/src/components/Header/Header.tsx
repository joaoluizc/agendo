import { Link, NavLink } from "react-router-dom";
import { Menu, Sun, Moon } from "lucide-react";
import { useTheme } from "../../providers/useTheme";
import agendoLogoLight from "../../resources/agendo-logo.svg";
import agendoLogoDark from "../../resources/agendo-logo-dark.svg";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import faviconLight from "../../resources/favicon-light.svg";
import faviconDark from "../../resources/favicon-dark.svg";
import { useUserSettings } from "@/providers/useUserSettings";
import { useEffect } from "react";
import { SignedIn, SignedOut, UserButton } from "@clerk/clerk-react";

function setFavicon(url: string) {
  const link =
    (document.querySelector("link[rel*='icon']") as HTMLLinkElement) ||
    document.createElement("link");
  link.type = "image/x-icon";
  link.rel = "shortcut icon";
  link.href = url;
  document.getElementsByTagName("head")[0].appendChild(link);
}

const Header = () => {
  const { setTheme, theme } = useTheme();
  const {
    setFirstName,
    setLastName,
    setEmail,
    setType,
    setTimeZone,
    setSlingId,
  } = useUserSettings();

  const setSiteTheme = (theme: string) => {
    if (theme === "light") {
      setTheme("light");
      setFavicon(faviconLight);
    } else if (theme === "dark") {
      setTheme("dark");
      setFavicon(faviconDark);
    } else {
      setTheme("system");
      setFavicon(faviconLight);
    }
  };

  useEffect(() => {
    const getUserSettings = async () => {
      const response = await fetch("api/user/info", {
        method: "GET",
        mode: "cors",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
      });
      if (response.ok) {
        const data = await response.json();
        setFirstName(data.firstName);
        setLastName(data.lastName);
        setEmail(data.email);
        setSlingId(data.slingId);
        setType(data.type);
        setTimeZone(data.timeZone);
      } else {
        console.error("Failed to get user settings");
      }
    };
    getUserSettings();
  });

  return (
    <>
      <header className="sticky top-0 flex h-16 items-center gap-4 border-b bg-background px-4 md:px-6 z-50">
        <nav className="hidden flex-col gap-6 text-lg font-medium md:flex md:flex-row md:items-center md:gap-5 md:text-sm lg:gap-6">
          <NavLink
            to="/"
            className="flex items-center gap-2 text-lg font-semibold md:text-base h-6 w-6"
          >
            <img src={theme === "light" ? agendoLogoDark : agendoLogoLight} />
            <span className="sr-only">Agendo</span>
          </NavLink>
          <NavLink
            to="/"
            className={({ isActive }) =>
              `${
                isActive ? "text-foreground" : "text-muted-foreground"
              } transition-colors hover:text-foreground`
            }
          >
            Home
          </NavLink>
          <SignedIn>
            <NavLink
              to="/dashboard"
              className={({ isActive }) =>
                `${
                  isActive ? "text-foreground" : "text-muted-foreground"
                } transition-colors hover:text-foreground`
              }
            >
              Dashboard
            </NavLink>
            <NavLink
              to="/dashboard/settings"
              className={({ isActive }) =>
                `${
                  isActive ? "text-foreground" : "text-muted-foreground"
                } transition-colors hover:text-foreground`
              }
            >
              Settings
            </NavLink>
          </SignedIn>
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
              <SignedIn>
                <NavLink
                  to="/dashboard"
                  className="text-muted-foreground hover:text-foreground"
                >
                  Dashboard
                </NavLink>
                <NavLink
                  to="/dashboard/settings"
                  className="hover:text-foreground"
                >
                  Settings
                </NavLink>
              </SignedIn>
            </nav>
          </SheetContent>
        </Sheet>
        <div className="flex w-fit items-center gap-4 md:ml-auto md:gap-2 lg:gap-4">
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
                <DropdownMenuItem onClick={() => setSiteTheme("light")}>
                  Light
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setSiteTheme("dark")}>
                  Dark
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setSiteTheme("system")}>
                  System
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>
    </>
  );
};

export default Header;
