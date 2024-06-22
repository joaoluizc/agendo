import utils from './utils/utils'
import AirDatepicker from 'air-datepicker';
import 'air-datepicker/air-datepicker.css';
import localeEn from 'air-datepicker/locale/en';


let sessionData;
let user;

function renderUserShifts(calendar, positions, users) {
  const userShiftsDiv = document.createElement('div');
  const shiftOwner = document.createElement('h4');
  const userName = users[calendar[0].user.id].legalName + ' ' + users[calendar[0].user.id].lastname;
  shiftOwner.textContent = `Today's shifts for ${userName}:`;
  userShiftsDiv.appendChild(shiftOwner);
  calendar.forEach((shift) => {
    const shiftDiv = document.createElement('div');
    const shiftStart = document.createElement('span');
    const shiftEnd = document.createElement('span');
    const shiftDetail = document.createElement('span');
    shiftDiv.appendChild(shiftStart);
    shiftDiv.appendChild(shiftEnd);
    shiftDiv.appendChild(shiftDetail);
    shiftStart.textContent = `${new Date(shift.dtstart).getHours().toLocaleString('en-US', { minimumIntegerDigits: 2})}:${new Date(shift.dtstart).getMinutes().toLocaleString('en-US', { minimumIntegerDigits: 2})} - `;
    shiftEnd.textContent = `${new Date(shift.dtend).getHours().toLocaleString('en-US', { minimumIntegerDigits: 2})}:${new Date(shift.dtend).getMinutes().toLocaleString('en-US', { minimumIntegerDigits: 2})}: `;
    shiftDetail.textContent = positions[shift.position.id];
    userShiftsDiv.appendChild(shiftDiv);
  })
  const allShifts = document.getElementById('all-shifts');
  allShifts.appendChild(userShiftsDiv);
}

async function fetchSessionData() {
  const response = await fetch('/api/account/session', {
    method: 'GET',
    headers: utils.authorization,
  })
  if (!response.ok) { throw new Error('ihh mano...')};
  sessionData = await response.json();
  //console.log(sessionData);

  user = sessionData.user;

  console.log(`Hello ${user.legalName} ${user.lastname}! Your user_ID IS ${user.id} and your org_id is ${user.orgs[0].id} (${user.orgs[0].name}).`);
};

async function getAllUsers() {
  const endpoint = '/api/users';
  const options = {
    method: 'GET',
    headers: utils.authorization,
  };

  const response = await fetch(endpoint, options);
  if (!response.ok) { throw new Error('ihh mano...')};
  
  const data = await response.json();
  // create object with user id as key
  const usersObj = data.reduce((acc, curr) => {
    const accumulation = { ...acc }
    accumulation[curr.id] = curr;
    return accumulation;
  }
  , {});
  console.log(usersObj);
  return usersObj;
}

function sortCalendarByUser(calendar) {
  const shiftsByUser = calendar.reduce((acc, curr) => {
    const accumulation = { ...acc }
    if (!accumulation[curr.user.id]) {
      accumulation[curr.user.id] = [];
    }
    accumulation[curr.user.id].push(curr);
    return accumulation;
  }, {});
  return shiftsByUser;
};

async function fetchTodaysCalendar(date) {
  const orgId = parseInt(user.orgs[0].id);
  const userId = user.id;
  const endpoint = `/api/calendar/${orgId}/users/${userId}?dates=${date}`;
  const options = {
    method: 'GET',
    headers: utils.authorization,
  };

  const response = await fetch(endpoint, options)
  if (!response.ok) { throw new Error('ihh mano...')};
  
  const calendarData = await response.json();
  const publishedCalendar = calendarData.filter((shift) => shift.status === 'published' && shift.type === 'shift');
  
  return publishedCalendar;
}

async function getAllPositions() {
  const endpoint = `api/groups?type=position`;
  const options = {
    method: 'GET',
    headers: utils.authorization,
  };

  const response = await fetch(endpoint, options);

  if (!response.ok) {throw new Error('ihh mano...')};

  const data = await response.json();

  const positions = data.reduce((acc, curr) => {
    const accumulation = { ...acc }
    accumulation[curr.id] = curr.name;
    return accumulation;
  }, {});
  return positions;
}

async function main() {
  const publishedCalendar = await fetchTodaysCalendar();
  const sortedCalendar = sortCalendarByUser(publishedCalendar);
  const positions = await getAllPositions();
  const users = await getAllUsers();
  Object.keys(sortedCalendar).forEach((key) => {
    renderUserShifts(sortedCalendar[key], positions, users);
  });
};

await fetchSessionData();
new AirDatepicker('#date', {
  onSelect: async ({date, formattedDate, datepicker}) => {
    datepicker.hide();
    console.log('start shift fetch');
    const selectedDate = utils.todayISO(date);
    const publishedCalendar = await fetchTodaysCalendar(selectedDate);
    const sortedCalendar = sortCalendarByUser(publishedCalendar);
    const positions = await getAllPositions();
    const users = await getAllUsers();
    console.log('start shifts render');
    document.getElementById('all-shifts').textContent = '';
    Object.keys(sortedCalendar).forEach((key) => {
      renderUserShifts(sortedCalendar[key], positions, users);
    });
    console.log('success');
  },
  locale: localeEn,
});

