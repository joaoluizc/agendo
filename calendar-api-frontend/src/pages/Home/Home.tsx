import Footer from "@/components/Footer/Footer";
import background from "../../resources/background-login.svg";

function Home() {
  return (
    <div>
      <div
        className="hero"
        style={{
          backgroundImage: `url(${background})`,
          height: "70vh",
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      ></div>
      <div className="py-8 bg-accent" style={{ height: "30vh" }}>
        <div className="container mx-auto flex h-full">
          <div className="w-1/2 h-full">
            <div className="flex items-center justify-center h-full">
              <h2 className="text-2xl font-bold mb-4">
                Keep organized efficiently
              </h2>
            </div>
          </div>
          <div className="w-1/2 h-full flex items-center justify-center">
            <p>
              Never miss a shift - have them all organized and synced to your
              calendar automagically.
            </p>
          </div>
        </div>
      </div>
      <div className="py-8" style={{ height: "30vh" }}>
        <div className="container mx-auto flex h-full">
          <div className="w-1/2 h-full flex items-center justify-center">
            <p>
              <ul className="list-disc list-inside">
                <li>Add, edit, and delete shifts</li>
                <li>Sync with Google Calendar for seamless integration.</li>
                <li>
                  View your and your team&apos;s shifts in a single calendar
                  view.
                </li>
              </ul>
            </p>
          </div>
          <div className="w-1/2 h-full">
            <div className="flex items-center justify-center h-full">
              <h2 className="text-2xl font-bold mb-4">Features and Benefits</h2>
            </div>
          </div>
        </div>
      </div>
      <div className="py-8 bg-accent" style={{ height: "30vh" }}>
        <div className="container mx-auto flex h-full">
          <div className="w-1/2 h-full">
            <div className="flex items-center justify-center h-full">
              <h2 className="text-2xl font-bold mb-4">How It Works</h2>
            </div>
          </div>
          <div className="w-1/2 h-full flex items-center justify-center">
            <p>
              Getting started with our app is simple and straightforward:
              <ul className="list-disc list-inside">
                <li>Sign up or log in with Google.</li>
                <li>
                  Make sure to allow the necessary permissions for the app!
                </li>
                <li>
                  Get started adding and managing your team&apos;s shifts.
                </li>
                <li>
                  Sync your shifts with Google Calendar for easy access and
                  integration.
                </li>
              </ul>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Home;
