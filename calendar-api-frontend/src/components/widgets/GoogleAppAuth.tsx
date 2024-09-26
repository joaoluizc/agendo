import { Button } from "@/components/ui/button.tsx";

const GoogleAppAuth = () => {
  const signIn = () => {
    const token = localStorage.getItem("token");
    fetch("api/gcalendar/login", {
      method: "GET",
      headers: {
        authorization: `${token}`,
      },
    }).then((response) => {
      if (response.status === 200) {
        response.json().then((data) => {
          if (data.ssoUrl) {
            console.log("Redirecting to SSO URL", data.ssoUrl);
          }
          if (
            data.ssoUrl &&
            data.ssoUrl.startsWith("https://accounts.google.com")
          ) {
            window.location.href = data.ssoUrl;
          }
        });
      } else {
        console.log("Failed to sign in");
      }
    });
  };

  return <Button onClick={signIn}>Sign in with Google</Button>;
};

export default GoogleAppAuth;
