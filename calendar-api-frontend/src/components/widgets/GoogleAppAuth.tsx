import { Button } from "@/components/ui/button.tsx";

type GoogleAppAuthProps = {
  setShowErrorAlert: (state: boolean) => void;
};

const GoogleAppAuth = (props: GoogleAppAuthProps) => {
  const { setShowErrorAlert } = props;
  const signIn = () => {
    setShowErrorAlert(false);
    fetch("api/gcalendar/login").then((response) => {
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
        setShowErrorAlert(true);
      }
    });
  };

  return <Button onClick={signIn}>Log in with Google</Button>;
};

export default GoogleAppAuth;
