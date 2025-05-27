import { useAuth } from "@clerk/clerk-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useUserSettings } from "@/providers/useUserSettings";
import { Copy } from "lucide-react";

function GenerateAPIToken() {
  const { getToken } = useAuth();
  const [token, setToken] = useState("");
  const { type: userType } = useUserSettings();

  if (userType === "admin") {
    const handleGenerateToken = async () => {
      let response;
      try {
        response = await getToken({
          template: "frontend-1m-token",
        });
      } catch (error) {
        console.error("Error generating token:", error);
        return;
      }
      if (response) {
        setToken(response);
      } else {
        console.error("No token received");
      }
    };

    return (
      <Card className="" id="generate-api-token">
        <CardHeader>
          <CardTitle>Generate API Token</CardTitle>
          <CardDescription>
            This token is valid for 1 month. Copy and save it in a secure place.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {token === "" && (
              <Button onClick={handleGenerateToken} className="w-full">
                Generate Token
              </Button>
            )}
            {token && (
              <div>
                <Label htmlFor="generated-token">Generated Token</Label>
                <div className="relative mt-2">
                  <Input
                    id="generated-token"
                    value={token}
                    readOnly
                    className="pr-16"
                  />
                  <Button
                    onClick={() => {
                      navigator.clipboard.writeText(token);
                    }}
                    className="absolute inset-y-1.5 right-2 px-3 h-[70%]"
                  >
                    <Copy size={16} />
                  </Button>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  return null;
}

export default GenerateAPIToken;
