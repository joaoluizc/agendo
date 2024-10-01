import { Button } from "@/components/ui/button.tsx";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.tsx";
import { Input } from "@/components/ui/input.tsx";
import GoogleAppAuth from "@/components/widgets/GoogleAppAuth.tsx";
import { Label } from "@/components/ui/label.tsx";
import { useEffect, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { CrossCircledIcon } from "@radix-ui/react-icons";

const GoogleIntegration = () => {
  const [isGoogleAuthenticated, setIsGoogleAuthenticated] = useState(false);
  const [userGoogleInfo, setUserGoogleInfo] = useState("");
  const [showErrorAlert, setShowErrorAlert] = useState(false);

  const getGoogleUserInfo = async () => {
    try {
      const response = await fetch("api/gcalendar/userinfo", {
        method: "GET",
        mode: "cors",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
      });
      if (response.status === 204) {
        setIsGoogleAuthenticated(false);
        return;
      }
      setIsGoogleAuthenticated(true);
      const data = await response.json();
      setUserGoogleInfo(data.email);
      return data;
    } catch (error) {
      console.error("Failed to fetch Google user info:", error);
    }
  };

  const disconnectGoogle = async () => {
    const response = await fetch("api/gcalendar/disconnect", {
      method: "POST",
      mode: "cors",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
    });
    if (!response.ok) {
      console.error("Failed to disconnect Google account");
      return;
    }
    setIsGoogleAuthenticated(false);
  };

  useEffect(() => {
    getGoogleUserInfo();
  }, []);

  return (
    <Card className="scroll-mt-20" id="google-integration">
      <CardHeader>
        <CardTitle>Google integration</CardTitle>
        <CardDescription>
          Used to authenticate with Google calendar.
        </CardDescription>
      </CardHeader>
      {isGoogleAuthenticated ? (
        <CardContent>
          {showErrorAlert ? (
            <Alert>
              <CrossCircledIcon className="w-5 h-5 text-red-500" />
              <AlertTitle>Uh oh</AlertTitle>
              <AlertDescription>
                Something went wrong. Please try again.
              </AlertDescription>
            </Alert>
          ) : null}
          <Label>
            Google Email
            <Input disabled value={userGoogleInfo} />
          </Label>
        </CardContent>
      ) : null}
      <CardFooter className="border-t px-6 py-4 gap-5">
        {isGoogleAuthenticated ? (
          <Button variant="outline" onClick={disconnectGoogle}>
            Disconnect
          </Button>
        ) : (
          <GoogleAppAuth setShowErrorAlert={setShowErrorAlert}></GoogleAppAuth>
        )}
      </CardFooter>
    </Card>
  );
};

export default GoogleIntegration;
