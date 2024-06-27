import { Avatar, AvatarFallback, AvatarImage } from '@radix-ui/react-avatar';
import AirDatepicker from 'air-datepicker';
import 'air-datepicker/air-datepicker.css';
import localeEn from 'air-datepicker/locale/en';
import { useEffect, useState } from 'react';
import utils from './utils/utils';
import { User } from './types/slingTypes';

const Schedule = () => {
  const [sortedCalendar, setSortedCalendar] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  useEffect(() => {
    const fetchData = async () => {
      new AirDatepicker('#date', {
        onSelect: async ({ date, datepicker }) => {
          setIsLoading(true);
          datepicker.hide();
          console.log('start shift fetch');
          const selectedDate = utils.todayISO(date);
          const endpoint = `/api/sling/calendar?date=${selectedDate}`;
          const response = await fetch(endpoint);
          if (!response.ok) {
            throw new Error('Failed to fetch shifts' + response.statusText);
          }
          let data = await response.json();
          // Sort shifts for each user by start time
          data = data.map((user: User) => ({
            ...user,
            shifts: user.shifts.sort((a, b) => new Date(a.dtstart).getTime() - new Date(b.dtstart).getTime())
          }));
          setSortedCalendar(data);
          setIsLoading(false);
          console.log(data);
        },
        locale: localeEn,
      });
    };
    fetchData();
  }, []);

  // Array to represent hours of the day
  const hours = Array.from({ length: 24 }, (_, i) => `${i}:00`);

  return (
    <div>
      {!isLoading ? (
        <div className="flex flex-col">
          {/* Header with hours */}
          <div className="flex">
            <div className="w-1/6 bg-gray-100 p-2"></div>
            <div className="flex-1 overflow-x-auto">
              <div className="grid" style={{ gridTemplateColumns: 'repeat(48, minmax(0, 1fr))' }}>
                {Array.from({ length: 48 }, (_, i) => (
                  <div
                    key={i}
                    className={`col-span-2 border-r border-gray-200 text-center text-xs ${i % 2 === 0 ? '' : 'hidden'}`}
                    style={{ gridColumn: `span 2` }}
                  >
                    {i % 2 === 0 && hours[i / 2]}
                  </div>
                ))}
              </div>
            </div>
          </div>
          {/* User rows */}
          {sortedCalendar.map((user, idx) => (
            <div key={idx} className="flex">
              <div className="w-1/6 h-10 bg-gray-100 p-2 flex items-center">
                <Avatar>
                  <AvatarImage src={user.avatar} className="w-7 h-7 rounded-full mr-2" />
                  <AvatarFallback className="w-7 h-7 px-2 py-1 rounded-full mr-2 bg-slate-950 text-slate-100 font-semibold">
                    {user.name.split(' ').map((n) => n[0]).join('')}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <div className="text-sm font-semibold">{`${user.name} ${user.lastname}`}</div>
                </div>
              </div>
              <div className="flex-1 overflow-x-auto">
                <div className="grid border-b border-gray-200" style={{ gridTemplateColumns: 'repeat(48, minmax(0, 1fr))' }}>
                  {user.shifts.map((shift, idx) => {
                    const start = calculateGridColumnStart(shift.dtstart);
                    const span = calculateGridColumnSpan(shift.dtstart, shift.dtend);

                    return (
                      <div
                        key={idx}
                        className={`p-2 m-1 text-xs overflow-hidden whitespace-nowrap truncate`}
                        style={{
                          gridColumnStart: start,
                          gridColumnEnd: `span ${span}`,
                          backgroundColor: shift.position.color,
                        }}
                      >
                        {shift.position.name}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div>Loading...</div>
      )}
    </div>
  );
};

const calculateGridColumnStart = (startISO: string) => {
  const start = new Date(startISO);
  const startHour = start.getHours();
  const startMinutes = start.getMinutes();
  return startHour * 2 + Math.floor(startMinutes / 30) + 1; // Assuming each column represents 30 minutes
};

const calculateGridColumnSpan = (startISO: string, endISO: string) => {
  const start = new Date(startISO);
  const end = new Date(endISO);
  const durationInMinutes = (end.getTime() - start.getTime()) / (1000 * 60);
  return Math.ceil(durationInMinutes / 30); // Assuming each column represents 30 minutes
};

export default Schedule;
