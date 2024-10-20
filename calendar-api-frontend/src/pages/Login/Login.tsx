import { useState } from "react";
// import { Button } from "@/components/ui/button.tsx";
// import { Input } from "@/components/ui/input.tsx";
// import { Label } from "@/components/ui/label.tsx";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert.tsx";
import { CrossCircledIcon } from "@radix-ui/react-icons";
import background from "../../resources/background-login.svg";
// import { useNavigate } from "react-router-dom";
import GoogleAppAuth from "@/components/widgets/GoogleAppAuth";

const Login = () => {
  // const [email, setEmail] = useState("");
  // const [password, setPassword] = useState("");
  // const [showWrongPswdAlert, setShowWrongPswdAlert] = useState(false);
  // const [showEmailNotFoundAlert, setShowEmailNotFoundAlert] = useState(false);
  const [showErrorAlert, setShowErrorAlert] = useState(false);
  // const navigate = useNavigate();

  // const handleSubmit = async () => {
  //   setShowWrongPswdAlert(false);
  //   setShowEmailNotFoundAlert(false);
  //   setShowErrorAlert(false);
  //   const response = await fetch("api/user/login", {
  //     method: "POST",
  //     mode: "cors",
  //     credentials: "include",
  //     headers: {
  //       "Content-Type": "application/json",
  //     },
  //     body: JSON.stringify({ email, password }),
  //   });

  //   if (response.ok) {
  //     navigate("/home");
  //   } else {
  //     const error = await response.json();
  //     console.error("Login failed:", error);
  //     if (error.msg === "Invalid credentials. Wrong password.") {
  //       setShowWrongPswdAlert(true);
  //     } else if (error.msg === "Invalid credentials. Email not found.") {
  //       setShowEmailNotFoundAlert(true);
  //     } else {
  //       setShowErrorAlert(true);
  //       console.log("Login failed:", error);
  //     }
  //   }
  // };

  return (
    <div className="w-full h-[calc(100vh-4rem)] lg:grid lg:min-h-[400px] lg:grid-cols-2 xl:min-h-[500px]">
      <div className="flex items-center justify-center py-12">
        <div className="mx-auto grid w-[350px] gap-6">
          <div className="grid gap-2 text-center">
            <h1 className="text-3xl font-bold">Login</h1>
            <p className="text-balance text-muted-foreground">
              Login with Google to start using the app.
            </p>
          </div>
          {/* {showEmailNotFoundAlert ? (
            <Alert>
              <CrossCircledIcon className="w-5 h-5 text-red-500" />
              <AlertTitle>Uh oh</AlertTitle>
              <AlertDescription>
                Email not found. Please check it or sign up.
              </AlertDescription>
            </Alert>
          ) : null}
          {showWrongPswdAlert ? (
            <Alert>
              <CrossCircledIcon className="w-5 h-5 text-red-500" />
              <AlertTitle>Uh oh</AlertTitle>
              <AlertDescription>Wrong password. Try again.</AlertDescription>
            </Alert>
          ) : null} */}
          {showErrorAlert ? (
            <Alert>
              <CrossCircledIcon className="w-5 h-5 text-red-500" />
              <AlertTitle>Uh oh</AlertTitle>
              <AlertDescription>
                Internal error. Try again later.
              </AlertDescription>
            </Alert>
          ) : null}
          <div className="grid gap-4">
            {/* <div className="grid gap-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                type="email"
                placeholder="m@example.com"
                required
              />
            </div>
            <div className="grid gap-2">
              <div className="flex items-center">
                <Label htmlFor="password">Password</Label>
                <Link
                  href="/forgot-password"
                  className="ml-auto inline-block text-sm underline"
                >
                  Forgot your password?
                </Link>
              </div>
              <Input
                id="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                type="password"
                required
              />
            </div>
            <Button type="submit" className="w-full" onClick={handleSubmit}>
              Login
            </Button> */}
            {/* <Button className="w-full" onClick={handleGoogleLogin}>
              Login with Google
            </Button> */}
            <GoogleAppAuth
              setShowErrorAlert={setShowErrorAlert}
            ></GoogleAppAuth>
          </div>
          {/* <div className="mt-4 text-center text-sm">
            Don&apos;t have an account?{" "}
            <a
              onClick={() => navigate("/signup")}
              className="underline cursor-pointer"
            >
              Sign up
            </a>
          </div> */}
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
