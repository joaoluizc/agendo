import { useEffect, useState } from "react";

const CalendarHeader = () => {
  const [currentHour, setCurrentHour] = useState(new Date().getHours());

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentHour(new Date().getHours());
    }, 60 * 1000); // update every minute
    return () => clearInterval(interval);
  }, []);
  const hours = Array.from({ length: 24 }, (_, i) => `${i}:00`);

  return (
    <div className="flex sticky top-16 bg-background z-20">
      <div className="py-2" style={{ width: "12%" }}></div>
      <div className="flex-1 overflow-x-auto">
        <div
          className="grid"
          style={{ gridTemplateColumns: "repeat(48, minmax(0, 1fr))" }}
        >
          {Array.from({ length: 48 }, (_, i) => (
            <div
              key={i}
              className={`col-span-2 border-r text-center text-xs font-bold truncate font-semibold py-4 ${
                i % 2 === 0 ? "" : "hidden"
              } ${currentHour === i / 2 ? "bg-secondary/80" : "background"}`}
              style={{ gridColumn: `span 2` }}
            >
              {i % 2 === 0 && hours[i / 2]}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default CalendarHeader;
