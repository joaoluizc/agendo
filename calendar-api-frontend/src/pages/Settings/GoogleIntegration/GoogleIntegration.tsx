import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import GoogleAppAuth from "@/components/widgets/GoogleAppAuth"
import { Label } from "@radix-ui/react-label"
import { useEffect, useState } from "react"

const GoogleIntegration = () => {
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
    )
}

export default GoogleIntegration;