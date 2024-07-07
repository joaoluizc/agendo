import { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { CrossCircledIcon } from "@radix-ui/react-icons";
import background from "../../resources/background-login.jpeg"
import { useNavigate } from "react-router-dom";

const Signup = () => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPasswordMismatchAlert, setShowPasswordMismatchAlert] = useState(false);
  const [showEmailExistsAlert, setShowEmailExistsAlert] = useState(false);
  const [showErrorAlert, setShowErrorAlert] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async () => {
    setShowPasswordMismatchAlert(false);
    setShowEmailExistsAlert(false);
    setShowErrorAlert(false);

    if (password !== confirmPassword) {
      setShowPasswordMismatchAlert(true);
      return;
    }

    const response = await fetch('api/register', {
      method: 'POST',
      mode: 'cors',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name, email, password }),
    });

    if (response.ok) {
      navigate('/home');
    } else {
      const error = await response.json();
      console.error('Signup failed:', error);
      if (error.msg === 'Email already exists.') {
        setShowEmailExistsAlert(true);
      } else {
        setShowErrorAlert(true);
        console.log('Signup failed:', error);
      }
    }
  };

  return (
    <div className="w-full h-[calc(100vh-4rem)] lg:grid lg:min-h-[400px] lg:grid-cols-2 xl:min-h-[500px]">
      <div className="flex items-center justify-center py-12">
        <div className="mx-auto grid w-[350px] gap-6">
          <div className="grid gap-2 text-center">
            <h1 className="text-3xl font-bold">Sign Up</h1>
            <p className="text-balance text-muted-foreground">
              Enter your details below to create a new account
            </p>
          </div>
          {showEmailExistsAlert ? (
            <Alert>
              <CrossCircledIcon className="w-5 h-5 text-red-500" />
              <AlertTitle>Uh oh</AlertTitle>
              <AlertDescription>
                Email already exists. Please try logging in.
              </AlertDescription>
            </Alert>
          ) : null}
          {showPasswordMismatchAlert ? (
            <Alert>
              <CrossCircledIcon className="w-5 h-5 text-red-500" />
              <AlertTitle>Uh oh</AlertTitle>
              <AlertDescription>
                Passwords do not match. Try again.
              </AlertDescription>
            </Alert>
          ) : null}
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
            <div className="grid gap-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                type="text"
                placeholder="John Doe"
                required
              />
            </div>
            <div className="grid gap-2">
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
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                type="password"
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="confirmPassword">Confirm Password</Label>
              <Input
                id="confirmPassword"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                type="password"
                required
              />
            </div>
            <Button type="submit" className="w-full" onClick={handleSubmit}>
              Sign Up
            </Button>
            <Button variant="outline" className="w-full">
              Sign Up with Google (coming soon)
            </Button>
          </div>
          <div className="mt-4 text-center text-sm">
            Already have an account?{" "}
            <a onClick={() => navigate('/login')} className="underline cursor-pointer">
              Log in
            </a>
          </div>
        </div>
      </div>
      <div className="hidden bg-muted lg:block">
        <img
          src={background}
          alt="Image"
          width="1920"
          height="1080"
          className="h-full w-full object-cover dark:brightness-[0.2] dark:grayscale"
        />
      </div>
    </div>
  );
};

export default Signup;
