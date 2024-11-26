import { Outlet, useNavigate } from "react-router-dom";
import { ClerkProvider } from "@clerk/clerk-react";
import Header from "@/components/Header/Header";
import Footer from "@/components/Footer/Footer";
import { useTheme } from "@/providers/useTheme";
import { dark } from "@clerk/themes";

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

if (!PUBLISHABLE_KEY) {
  throw new Error("Missing Publishable Key");
}

export default function RootLayout() {
  const navigate = useNavigate();
  const { theme } = useTheme();

  return (
    <ClerkProvider
      routerPush={(to) => navigate(to)}
      routerReplace={(to) => navigate(to, { replace: true })}
      publishableKey={PUBLISHABLE_KEY}
      appearance={{
        baseTheme: theme === "dark" ? dark : undefined,
      }}
    >
      <Header />
      <main>
        <Outlet />
      </main>
      <Footer />
    </ClerkProvider>
  );
}
