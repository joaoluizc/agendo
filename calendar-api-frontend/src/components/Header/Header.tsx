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
import React from "react";
import { cn } from "@/lib/utils";

const Header = () => {
  const { setTheme, theme } = useTheme();

  const setSiteTheme = (theme: string) => {
    if (theme === "light") {
      setTheme("light");
    } else if (theme === "dark") {
      setTheme("dark");
    } else {
      setTheme("system");
    }
  };

  return (
    <>
      <header className="sticky top-0 flex h-16 items-center gap-4 border-b bg-background px-4 md:px-6 z-50">
        <NavigationMenu className="hidden md:flex gap-4 items-center flex-1">
          <NavigationMenuList>
            <NavigationMenuItem>
              <NavLink
                to="/"
                className="flex items-center gap-2 text-lg font-semibold md:text-base h-6 w-6 mr-3"
              >
                <NavigationMenuLink
                  className={`group inline-flex h-6 w-6 items-center justify-center rounded-md bg-background px-0.5 py-0.5 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground focus:outline-none disabled:pointer-events-none disabled:opacity-50 data-[active]:bg-accent/50 data-[state=open]:bg-accent/50`}
                >
                  <img
                    src={theme === "light" ? agendoLogoDark : agendoLogoLight}
                  />
                  <span className="sr-only">Agendo</span>
                </NavigationMenuLink>
              </NavLink>
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
