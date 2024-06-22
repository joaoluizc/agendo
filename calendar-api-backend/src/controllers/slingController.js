const utils =  import.meta.resolve('/utils/utils')
import dotenv from 'dotenv';
import express from 'express'

dotenv.config();

const slingRouter = express.Router();

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
    const endpoint = `https://api.getsling.com/v1/calendar/${orgId}/users/${userId}?dates=${date}`;
    const options = {
      method: 'GET',
      headers: process.env.SLING_AUTHORIZATION
    };
  
    const response = await fetch(endpoint, options)
    if (!response.ok) { throw new Error('ihh mano...')};
    
    const calendarData = await response.json();
    const publishedCalendar = calendarData.filter((shift) => shift.status === 'published' && shift.type === 'shift');
    
    return publishedCalendar;
}

async function getAllPositions() {
    const endpoint = `https://api.getsling.com/v1/groups?type=position`;
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

async function getAllUsers() {
    const endpoint = 'https://api.getsling.com/v1/users';
    const options = {
      method: 'GET',
      headers: {
        'Authorization': process.env.SLING_AUTHORIZATION,
      }
    };
  
    const response = await fetch(endpoint, options);
    if (!response.ok) { 
      const error = await response.json();
      console.log(utils.authorization);
      throw new Error(`ihh mano... ${error.message}`);
    }
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

async function fetchSessionData() {
  const response = await fetch('https://api.getsling.com/v1/account/session', {
    method: 'GET',
    headers: {
      headers: utils.authorization,
    },
  })
  if (!response.ok) { throw new Error('ihh mano...')};
  sessionData = await response.json();

  user = sessionData.user;

  console.log(`Hello ${user.legalName} ${user.lastname}! Your user_ID IS ${user.id} and your org_id is ${user.orgs[0].id} (${user.orgs[0].name}).`);
};

slingRouter.get('/positions', (req, res) => res.status(200).json(getAllPositions));
slingRouter.get('/users', async (req, res) => {
  const response = await getAllUsers();
  res.status(200).json({response})
});

export default slingRouter;