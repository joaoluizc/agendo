// import { useState } from "react";
// import { Button } from "@/components/ui/button.tsx";
// import { Input } from "@/components/ui/input.tsx";
// import { Label } from "@/components/ui/label.tsx";
// import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert.tsx";
// import { CrossCircledIcon } from "@radix-ui/react-icons";
import background from "../../resources/background-login.svg";
// import { useNavigate } from "react-router-dom";
// import GoogleAppAuth from "@/components/widgets/GoogleAppAuth";
import { SignIn } from "@clerk/clerk-react";

const Login = () => {
  // const [showErrorAlert, setShowErrorAlert] = useState(false);

  return (
    <div className="w-full h-[calc(90vh-4rem)] lg:grid lg:min-h-[400px] lg:grid-cols-2 xl:min-h-[500px]">
      <div className="flex items-center justify-center py-12">
        <div className="mx-auto grid w-[350px] gap-6">
          {/* <div className="grid gap-2 text-center">
            <h1 className="text-3xl font-bold">Login</h1>
            <p className="text-balance text-muted-foreground">
              Login with Google to start using the app.
            </p>
          </div> */}
          {/* {showErrorAlert ? (
            <Alert>
              <CrossCircledIcon className="w-5 h-5 text-red-500" />
              <AlertTitle>Uh oh</AlertTitle>
              <AlertDescription>
                Internal error. Try again later.
              </AlertDescription>
            </Alert>
          ) : null} */}
          <div className="grid gap-4">
            {/* <GoogleAppAuth
              setShowErrorAlert={setShowErrorAlert}
            ></GoogleAppAuth> */}
            <SignIn />
          </div>
        </div>
      </div>
      <div className="hidden bg-muted lg:block">
        <img
          src={background}
          alt="Image"
          width="1920"
          height="1080"
          className="h-full w-full object-cover object-center"
        />
      </div>
    </div>
  );
};

export default Login;
