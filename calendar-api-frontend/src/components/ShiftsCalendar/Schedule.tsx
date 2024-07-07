import { Avatar, AvatarFallback, AvatarImage } from '@radix-ui/react-avatar';
import AirDatepicker from 'air-datepicker';
import 'air-datepicker/air-datepicker.css';
import localeEn from 'air-datepicker/locale/en';
import { useEffect, useState } from 'react';
import utils from '../../utils/utils';
import { Shift, User } from '../../types/slingTypes';
import { Label } from '@radix-ui/react-label';
import { Input } from '../ui/input';
import { CalendarSearch } from 'lucide-react';

const Schedule = () => {
  const [sortedCalendar, setSortedCalendar] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());

  const getShifts = async (date: Date) => {
    setIsLoading(true);
    console.log('start shift fetch');
    const selectedDate = utils.todayISO(date);
    const endpoint = `/api/sling/calendar?date=${selectedDate}`;
    const response = await fetch(endpoint, {
      method: 'GET',
      credentials: 'include',
      mode: 'cors',
      headers: {
        'Content-Type': 'application/json',
      },
    });
    if (!response.ok) {
      throw new Error('Failed to fetch shifts' + response.statusText);
    }
    let data = await response.json();
    // Sort shifts for each user by start time
    data = data.map((user: User) => ({
      ...user,
      shifts: user.shifts.sort((a, b) => new Date(a.dtstart).getTime() - new Date(b.dtstart).getTime())
        .map((shift: any) => { return { ...shift, dateRequested: selectedDate } }),
    })).sort((a: User, b: User) => new Date(a.shifts[0].dtstart).getTime() - new Date(b.shifts[0].dtstart).getTime());
    setSortedCalendar(data);
    setSelectedDate(date);
    setIsLoading(false);
    console.log(data);
  }

  useEffect(() => {
    const fetchData = async () => {
      new AirDatepicker('#date', {
        onSelect: async ({ date, datepicker }) => {
          datepicker.hide();
          if (Array.isArray(date)) date = date[0]; // AirDatepicker might return an array of dates
          await getShifts(date);
        },
        locale: localeEn,
      });
    };
    fetchData();
    getShifts(new Date());
  }, []);

  // Array to represent hours of the day
  const hours = Array.from({ length: 24 }, (_, i) => `${i}:00`);

  return (
    <div>
      <div id="app" className="flex flex-row gap-5 p-5 w-full">
        <Label htmlFor="date" className="flex relative">
          <Input id="date" className="" placeholder="Click here to select a date" value={selectedDate.toDateString()} />
          <CalendarSearch className="absolute top-1/2 right-2 transform -translate-y-1/2" />
        </Label>
      </div>
      {/* Header with hours */}
      <div className="flex">
        <div className="p-2" style={{ width: '12%' }}></div>
        <div className="flex-1 overflow-x-auto">
          <div className="grid" style={{ gridTemplateColumns: 'repeat(48, minmax(0, 1fr))' }}>
            {Array.from({ length: 48 }, (_, i) => (
              <div
                key={i}
                className={`col-span-2 border-r text-center text-xs font-bold truncate font-semibold ${i % 2 === 0 ? '' : 'hidden'}`}
                style={{ gridColumn: `span 2` }}
              >
                {i % 2 === 0 && hours[i / 2]}
              </div>
            ))}
          </div>
        </div>
      </div>
      {!isLoading ? (
        <div className="flex flex-col">
          {/* User rows */}
          {sortedCalendar.map((user, idx) => (
            <div key={idx} className="flex">
              <div className="h-12 p-2 flex items-center border-b" style={{ width: '12%' }}>
                <Avatar>
                  <AvatarImage src={user.avatar} className="w-7 h-7 rounded-full mr-2" />
                  <AvatarFallback className="w-7 h-7 px-2 py-1 rounded-full mr-2 bg-slate-950 text-slate-100 font-semibold">
                    {user.name.split(' ').map((n) => n[0]).join('')}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <div className="text-xs font-semibold truncate">{`${user.name} ${user.lastname}`}</div>
                </div>
              </div>
              <div id="data-column" className="flex-1 overflow-x-auto">
                <div className="relative">
                  <div className="absolute inset-0 grid border-b h-12" style={{ gridTemplateColumns: 'repeat(24, minmax(0, 1fr))' }}>
                    {[...Array(24).keys()].map(() => {
                      return (
                        <div className="border-r"></div>
                      );
                    })}
                  </div>
                </div>
                <div className="grid border-b border-gray-200 h-12" style={{ gridTemplateColumns: 'repeat(48, minmax(0, 1fr))' }}>
                  {user.shifts.map((shift, idx) => {
                    const start = calculateGridColumnStart(shift);
                    const span = calculateGridColumnSpan(shift);

                    return (
                      <div
                        key={idx}
                        className={`p-1 m-1 z-10 overflow-hidden whitespace-nowrap truncate rounded text-white`}
                        style={{
                          gridColumnStart: start,
                          gridColumnEnd: `span ${span}`,
                          backgroundColor: `color-mix(in srgb, ${shift.position.color} 95%, hsl(var(--shiftmix)) 20%)`,
                          fontSize: '0.6875rem',
                        }}
                      >
                        <div
                          className="font-bold truncate"
                        >
                          {startEndPretty(shift.dtstart, shift.dtend)}
                        </div>
                        <div
                          className="truncate"
                        >
                          {shift.position.name}
                        </div>
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

const calculateGridColumnStart = (shift: Shift) => {
  const start = new Date(shift.dtstart);
  const dateRendered = new Date(shift.dateRequested!.split('/')[1]);
  if (start.getDate() < dateRendered.getDate()) return 0; // Shift starts on previous day
  const startHour = start.getHours();
  const startMinutes = start.getMinutes();
  return startHour * 2 + Math.floor(startMinutes / 30) + 1; // Assuming each column represents 30 minutes
};

const calculateGridColumnSpan = (shift: Shift) => {
  const start = new Date(shift.dtstart);
  const end = new Date(shift.dtend);
  const dateRendered = new Date(shift.dateRequested!.split('/')[1]);
  console.log(start.getDate(), dateRendered.getDate());
  if (start.getDate() < dateRendered.getDate()) return end.getHours() * 2;
  const durationInMinutes = (end.getTime() - start.getTime()) / (1000 * 60);
  return Math.ceil(durationInMinutes / 30); // Assuming each column represents 30 minutes
};

const formatDatePretty = (date: string) => {
  // given a date, return a string in the format "HH:MM AM/PM"
  const dateObj = new Date(date);
  let timeString = dateObj.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

  if (timeString.endsWith(":00 AM") || timeString.endsWith(":00 PM")) {
    timeString = timeString.replace(":00", "");
  }

  return timeString;
}

const startEndPretty = (startRaw: string, endRaw: string) => {
  const start = formatDatePretty(startRaw);
  const end = formatDatePretty(endRaw);
  if (start.slice(-2) === end.slice(-2)) {
    return `${start.slice(0, -3)}-${end.slice(0, -3)} ${end.slice(-2)}`;
  }
  return `${start} - ${end}`;
}

export default Schedule;
