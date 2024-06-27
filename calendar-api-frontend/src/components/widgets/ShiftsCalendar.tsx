import {useEffect, useState} from 'react';
import utils from '../../utils/utils';
import AirDatepicker from 'air-datepicker';
import 'air-datepicker/air-datepicker.css';
import localeEn from 'air-datepicker/locale/en';
import { Shift, User } from '@/types/slingTypes';
import UserShiftsTable from './UserShiftsTable';

let sessionData: { user: User } = { user: {
  id: 0,
  orgs: [],
  legalName: '',
  lastname: '',
  active: false,
  avatar: '',
  deactivatedAt: null,
  email: '',
  hoursCap: 0,
  name: '',
  origin: null,
  preferredName: null,
  timeclockEnabled: false,
  timezone: '',
  type: ''
} };

interface SortedCalendar {
    [key: string]: Shift[];
}

interface Positions {
  [key: number]: string;
}

let user: User = {
  id: 0,
  orgs: [],
  legalName: '',
  lastname: '',
  active: false,
  avatar: '',
  deactivatedAt: null,
  email: '',
  hoursCap: 0,
  name: '',
  origin: null,
  preferredName: null,
  timeclockEnabled: false,
  timezone: '',
  type: ''
};


// function renderUserShifts(calendar: any[], positions: { [x: string]: string | null; }, users: User[]) {
//     const userShiftsDiv = document.createElement('div');
//     const shiftOwner = document.createElement('h4');
//     const userName = users[calendar[0].user.id].legalName + ' ' + users[calendar[0].user.id].lastname;
//     shiftOwner.textContent = `Today's shifts for ${userName}:`;
//     userShiftsDiv.appendChild(shiftOwner);
//     calendar.forEach((shift: { dtstart: string | number | Date; dtend: string | number | Date; position: { id: string | number; }; }) => {
//       const shiftDiv = document.createElement('div');
//       const shiftStart = document.createElement('span');
//       const shiftEnd = document.createElement('span');
//       const shiftDetail = document.createElement('span');
//       shiftDiv.appendChild(shiftStart);
//       shiftDiv.appendChild(shiftEnd);
//       shiftDiv.appendChild(shiftDetail);
//       shiftStart.textContent = `${new Date(shift.dtstart).getHours().toLocaleString('en-US', { minimumIntegerDigits: 2})}:${new Date(shift.dtstart).getMinutes().toLocaleString('en-US', { minimumIntegerDigits: 2})} - `;
//       shiftEnd.textContent = `${new Date(shift.dtend).getHours().toLocaleString('en-US', { minimumIntegerDigits: 2})}:${new Date(shift.dtend).getMinutes().toLocaleString('en-US', { minimumIntegerDigits: 2})}: `;
//       shiftDetail.textContent = positions[shift.position.id];
//       userShiftsDiv.appendChild(shiftDiv);
//     })
//     const allShifts = document.getElementById('all-shifts');
//     allShifts?.appendChild(userShiftsDiv);
//   }
  
  async function fetchSessionData() {
    const response = await fetch('/slingapi/account/session', {
      method: 'GET',
      headers: utils.authorization,
    })
    if (!response.ok) { throw new Error('ihh mano...')};
    sessionData = await response.json();
    // console.log(sessionData);
  
    user = sessionData.user;
    if (!user.orgs) return;
    console.log(`Hello ${user.legalName} ${user.lastname}! Your user_ID IS ${user.id} and your org_id is ${user.orgs[0].id} (${user.orgs[0].name}).`);
  };
  
  async function getAllUsers() {
    const endpoint = '/slingapi/users';
    const options = {
      method: 'GET',
      headers: utils.authorization,
    };
  
    const response = await fetch(endpoint, options);
    if (!response.ok) { throw new Error('ihh mano...')};
    
    const data = await response.json();
    // create object with user id as key
    const usersObj = data.reduce((acc: any, curr: { id: string | number; }) => {
      const accumulation = { ...acc }
      accumulation[curr.id] = curr;
      return accumulation;
    }
    , {});
    return usersObj;
  }
  
  function sortCalendarByUser(calendar: any[]) {
    const shiftsByUser = calendar.reduce((acc: { [key: string]: any[] }, curr: { user: { id: string | number; }; }) => {
      const accumulation = { ...acc }
      if (!accumulation[curr.user.id]) {
        accumulation[curr.user.id] = [];
      }
      accumulation[curr.user.id].push(curr);
      return accumulation;
    }, {});
    return shiftsByUser;
  };
  
  async function fetchTodaysCalendar(date: any) {
    if (!user.orgs) return [];
    let orgId: number;
    if (typeof(user.orgs[0].id) !== 'number') {
       orgId = parseInt(user.orgs[0].id);
    } else {
      orgId = user.orgs[0].id;
    }
    const userId = user.id;
    const endpoint = `/slingapi/calendar/${orgId}/users/${userId}?dates=${date}`;
    const options = {
      method: 'GET',
      headers: utils.authorization,
    };
  
    const response = await fetch(endpoint, options)
    if (!response.ok) { throw new Error('ihh mano...')};
    
    const calendarData = await response.json();
    const publishedCalendar: Shift[] = calendarData.filter((shift: Shift) => shift.status === 'published' && shift.type === 'shift');
    
    return publishedCalendar;
  }
  
  async function getAllPositions() {
    const endpoint = `slingapi/groups?type=position`;
    const options = {
      method: 'GET',
      headers: utils.authorization,
    };
  
    const response = await fetch(endpoint, options);
    if (!response.ok) {throw new Error('ihh mano...')};
    const data = await response.json();

    interface CurrPosition {
      id: string;
      name: string;
    }

    const positions: { [key: string]: string } = data.reduce((acc: { [key: string]: string }, curr: CurrPosition) => {
      const accumulation = { ...acc }
      accumulation[curr.id] = curr.name;
      return accumulation;
    }, {});
    return positions;
  }
  
//   async function main() {
//     const publishedCalendar = await fetchTodaysCalendar();
//     const sortedCalendar = sortCalendarByUser(publishedCalendar);
//     const positions = await getAllPositions();
//     const users = await getAllUsers();
//     Object.keys(sortedCalendar).forEach((key) => {
//       renderUserShifts(sortedCalendar[key], positions, users);
//     });
//   };

const ShiftsCalendar = () => {
    const [isLoading, setIsLoading] = useState(false);
    const [sortedCalendar, setSortedCalendar] = useState({} as SortedCalendar);
    const [positions, setPositions] = useState({} as { [key: string]: string });
    const [users, setUsers] = useState([] as unknown as {[key: string]: User});
    
    useEffect(() => {
      const fetchData = async () => {
        await fetchSessionData();
        new AirDatepicker('#date', {
            onSelect: async ({date, formattedDate, datepicker}) => {
                setIsLoading(true);
                datepicker.hide();
                console.log('start shift fetch');
                console.log(date);
                const selectedDate = utils.todayISO(date);
                console.log(selectedDate);
                const publishedCalendar = await fetchTodaysCalendar(selectedDate);
                const sortedCalendar = sortCalendarByUser(publishedCalendar);
                setSortedCalendar(sortedCalendar);
                const positions = await getAllPositions();
                setPositions(positions);
                const users = await getAllUsers();
                setUsers(users);
                setIsLoading(false);
            },
            locale: localeEn,
          });
      }
      fetchData();
    });

    return (
        <div>
          {!isLoading ? (Object.entries(sortedCalendar).map(([key, value]) => {
            if (typeof(key) !== 'string') return (<div id={key}></div>)
            return (<UserShiftsTable key={key} user={users[key]} shifts={value} positions={positions} />)
            return <></>
          })) : (<div>Loading...</div>)}
        </div>
    );
};

export default ShiftsCalendar;