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
import GoogleAppAuth from "@/components/widgets/GoogleAppAuth";
import { Label } from "@radix-ui/react-label";
import { useEffect, useState } from "react";

export default function Settings() {

  const [isGoogleAuthenticated, setIsGoogleAuthenticated] = useState(false);
  const [userGoogleInfo, setUserGoogleInfo] = useState('');

  const getGoogleUserInfo = async () => {
    const response = await fetch("api/gcalendar/userinfo", {
      method: 'GET',
      mode: 'cors',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
    });
    if (!response.ok) {
      setIsGoogleAuthenticated(false);
      return;
    }
    setIsGoogleAuthenticated(true);
    const data = await response.json();
    setUserGoogleInfo(data.email);
    console.log('hi');
    console.log(data);
    return data;
  }

  const disconnectGoogle = async () => {
    const response = await fetch("api/gcalendar/disconnect", {
      method: 'POST',
      mode: 'cors',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
    });
    if (!response.ok) {
      console.error('Failed to disconnect Google account');
      return;
    }
    setIsGoogleAuthenticated(false);
  };

  useEffect(() => {
    getGoogleUserInfo();
  }, []);

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
              General
            </NavLink>
            <NavLink to="#">Google integration</NavLink>
          </nav>
          <div className="grid gap-6">
            <Card x-chunk="dashboard-04-chunk-1">
              <CardHeader>
                <CardTitle>Google integration</CardTitle>
                <CardDescription>
                  Used to authenticate with Google calendar.
                </CardDescription>
              </CardHeader>
              {isGoogleAuthenticated ? (
                <CardContent>
                  <Label>Google Email
                    <Input disabled value={userGoogleInfo}/>
                  </Label>
                </CardContent>) : null}
              <CardFooter className="border-t px-6 py-4 gap-5">
                {isGoogleAuthenticated ? (
                  <Button variant="outline" onClick={disconnectGoogle}>Disconnect</Button>
                ) : (
                  <GoogleAppAuth></GoogleAppAuth>
                )}
              </CardFooter>
            </Card>
            <Card x-chunk="dashboard-04-chunk-2">
              <CardHeader>
                <CardTitle>Plugins Directory</CardTitle>
                <CardDescription>
                  The directory within your project, in which your plugins are
                  located.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form className="flex flex-col gap-4">
                  <Input
                    placeholder="Project Name"
                    defaultValue="/content/plugins"
                  />
                  <div className="flex items-center space-x-2">
                    <Checkbox id="include" defaultChecked />
                    <label
                      htmlFor="include"
                      className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                    >
                      Allow administrators to change the directory.
                    </label>
                  </div>
                </form>
              </CardContent>
              <CardFooter className="border-t px-6 py-4">
                <Button>Save</Button>
              </CardFooter>
            </Card>
          </div>
        </div>
      </main>
    </div>
  )
}
