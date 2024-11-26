import background from "../../resources/background-login.svg";
import backgroundLight from "../../resources/background-login-light.svg";
import { SignIn } from "@clerk/clerk-react";
import { useTheme } from "@/providers/useTheme";

const Login = () => {
  const { theme } = useTheme();
  return (
    <div className="w-full h-[calc(90vh-4rem)] lg:grid lg:min-h-[400px] lg:grid-cols-2 xl:min-h-[500px]">
      <div className="flex items-center justify-center py-12">
        <div className="mx-auto grid w-[350px] gap-6">
          <div className="grid gap-4">
            <SignIn />
          </div>
        </div>
      </div>
      <div className="hidden bg-muted lg:block">
        <img
          src={theme === "dark" ? background : backgroundLight}
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
