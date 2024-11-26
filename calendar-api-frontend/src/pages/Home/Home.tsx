import { Link } from "react-router-dom";
import { useRef } from "react";
import backgroundDark from "../../resources/home-shifts-dark.svg";
import backgroundLight from "../../resources/home-shifts-light.svg";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Calendar, Users, RefreshCw } from "lucide-react";
import { useTheme } from "@/providers/useTheme";

export default function Home() {
  const featuresRef = useRef<HTMLElement>(null);
  const { theme } = useTheme();

  const scrollToFeatures = () => {
    featuresRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <main className="flex flex-col items-center justify-center min-h-screen bg-background">
      <section
        className="relative w-full"
        style={{ height: "calc(100vh - 4rem)" }}
      >
        <div
          className="hero"
          style={{
            backgroundImage: `url(${
              theme === "dark" ? backgroundDark : backgroundLight
            })`,
            height: "calc(100vh - 4rem)",
            backgroundSize: "cover",
            backgroundPosition: "10% 70%",
          }}
        ></div>
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent flex flex-col items-center justify-end text-white p-8">
          <div className="max-w-4xl w-full">
            <h1 className="text-4xl md:text-6xl font-bold mb-4 text-center">
              Simplify Shift Management
            </h1>
            <p className="text-xl md:text-2xl mb-8 text-center">
              Effortlessly manage team shifts and sync with Google Calendar
            </p>
            <div className="flex justify-center">
              <Button size="lg" className="text-lg" onClick={scrollToFeatures}>
                Get Started
              </Button>
            </div>
          </div>
        </div>
      </section>

      <section ref={featuresRef} className="container mx-auto px-4 mb-12">
        <h2 className="text-4xl font-bold text-center mb-8 pt-16">
          Why Choose Agendo?
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Calendar className="mr-2" />
                Easy Scheduling
              </CardTitle>
            </CardHeader>
            <CardContent>
              Create and manage shifts with an intuitive interface designed for
              efficiency.
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Users className="mr-2" />
                Team Collaboration
              </CardTitle>
            </CardHeader>
            <CardContent>
              Foster seamless communication and coordination among team members.
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <RefreshCw className="mr-2" />
                Google Calendar Sync
              </CardTitle>
            </CardHeader>
            <CardContent>
              Automatically sync shifts with Google Calendar for better time
              management.
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="container mx-auto px-4 mb-12 text-center">
        <h2 className="text-3xl font-bold mb-4">
          Ready to Streamline Your Team&apos;s Schedule?
        </h2>
        <p className="text-xl mb-8">
          Join others already using Agendo to simplify their shift management.
        </p>
        <Link to="/login">
          <Button size="lg" className="text-lg">
            Start Now
          </Button>
        </Link>
      </section>
    </main>
  );
}
