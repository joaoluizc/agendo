import dotenv from 'dotenv';
import slingController from '../controllers/slingController.js';
import gCalendarService from '../services/gCalendarService.js';
import userService from './userService.js';
import utils from '../utils/utils.js';
import { google } from 'googleapis';
import process from 'process';
import addedGCalEventsService from './addedGCalEventsService.js';

dotenv.config();


const getOAuth2Client = (tokens) => {
    const oauth2Client = new google.auth.OAuth2(process.env.CLIENT_ID, process.env.SECRET_ID, process.env.REDIRECT);
    oauth2Client.setCredentials(tokens);
    return oauth2Client;
};

const getUserInfo = async (tokens) => {
    // message for future joao: use sdk instead of this endpoint to get user info
    // https://developers.google.com/identity/sign-in/web/people#:~:text=To%20retrieve%20profile%20information%20for%20a%20user%2C%20use%20the%20getBasicProfile()%20method.%20For%20example%3A
    const response = await fetch('https://www.googleapis.com/oauth2/v1/userinfo?alt=json', {
        headers: {
            Authorization: `Bearer ${tokens.access_token}`,
        },
    });
    return await response.json();
};

const getUserEvents = async (email, date = new Date()) => {
    const tokens = await userService.getGapiToken(email);  // Retrieve tokens from the user service
    if (!tokens) {
        throw new Error('User not Google authenticated');
    }
    
    const calendarId = 'primary';
    const oauth2Client = getOAuth2Client(tokens);
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
    const selectedDate = new Date(date);
    console.log(selectedDate)
    selectedDate.setHours(0, 0, 0, 0);
    
    return new Promise((resolve, reject) => {
        calendar.events.list({
            calendarId,
            // set date to beginning of day
            timeMin: selectedDate.toISOString(),
            maxResults: 50,
            singleEvents: true,
            orderBy: 'startTime',
        }, (err, response) => {
            if (err) {
                console.log(`Can't fetch events`, err);
                reject(err);
            } else {
                const events = response.data.items;
                resolve(events);
            }
        });
    });
};

const getAllUsersEvents = async (date) => {
    const users = await userService.getAllUsersWithTokens();
    
    const allEventsPromises = users.map(async (user) => {
        const { email, slingId } = user;
        const events = await getUserEvents(email, date);
        return { email, slingId, events };
    });

    const allEvents = await Promise.all(allEventsPromises);
    return allEvents;
}

/**
 * Adds one event to user's calendar
 * @param {Object} user - object containing email, tokens (gapi token), and slingId
 * @param {Object} event - object containing summary, start, and end. start and end should contain dateTime and timeZone
 * To add multiple events, consider using addEvents for efficiency
 */
const addEvent = async (user, event) => {
    const { tokens } = user;
    const oauth2Client = getOAuth2Client(tokens);
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
    const addedEvent = await new Promise((resolve, reject) => {
        calendar.events.insert({
            calendarId: 'primary',
            resource: event,
        }, (err, response) => {
            if (err) {
                console.log(`Error adding event`, err);
                reject(err);
            } else {
                resolve(response);
            }
        });
    });
    return addedEvent.data;
}

/**
 * Add multiple events to user's calendar
 * @param {Object} user 
 * @param {Array} events 
 * @returns {Array} - array of responses from adding
 */
const addEvents = async (user, events) => {
    const { tokens } = user;
    const oauth2Client = getOAuth2Client(tokens);
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
    const eventsPromises = events.map(async (event) => {
        return new Promise((resolve, reject) => {
            calendar.events.insert({
                calendarId: 'primary',
                resource: event,
            }, (err, response) => {
                if (err) {
                    console.log(`Error adding event`, err);
                    reject(err);
                } else {
                    resolve(response);
                }
            });
        });
    });

    return Promise.all(eventsPromises);
}

const addDaysShiftsToGcal = async (date) => {
    let usersWithChanges = [];
    let numberOfAddedEvents = 0;
    try {
        const calendar = await slingController.getCalendar(date);
        console.log(`gCalendarController 1: Found ${calendar.length} shifts for date ${date}`);
        const usersWithGoogle = await userService.getAllUsersWithTokens();
        console.log(`gCalendarController 2: Found ${usersWithGoogle.length} users authenticated with Google`);
        usersWithGoogle.forEach(async (user) => {
            const slingUser = calendar.filter(slingUserCal => Number(slingUserCal.id) === Number(user.slingId))[0];
            if (!slingUser) {
                console.log(`Found no shifts for user ${user.email}, no event was added to calendar`);
                return;
            }
            const userShifts = slingUser.shifts;
            console.log(`gCalendarController 3: Found ${userShifts.length} shifts for user ${user.email}`);

            const prevAddedEvents = await addedGCalEventsService.findEventsByDate(date);

            console.log(`gCalendarController 5: Filtering shifts for ${user.email} to what user wants to sync`);
            const positionsToSync = user.positionsToSync.map(position => position.positionId.toString());
            const shiftsToAdd = userShifts.filter(event => positionsToSync.includes(event.position.id.toString()));
            const userEvents = shiftsToAdd.map(shift => utils.shiftToEvent(shift));

            console.log(`gCalendarController 6: Adding ${userEvents.length} shifts to GCal for ${user.email} on date ${date}`);
            usersWithChanges.push({email: user.email, addedEvents: userEvents});
            numberOfAddedEvents += userEvents.length;
            const addedEvents = await Promise.all(userEvents.map(async (event) => await gCalendarService.addEvent(user, event)));
            await addedGCalEventsService.addEvent(user, addedEvents);
            console.log(`gCalendarController 7: ${addedEvents?.length} event(s) added`);
        });
        if (numberOfAddedEvents?.length === 0 || usersWithChanges?.length === 0) {
            return {status: 200, message: 'No shifts eligible to be added to GCal'};
        }
        return {status: 200, message: `${numberOfAddedEvents} shifts added to GCal for ${usersWithChanges.length} users`, addedEvents: usersWithChanges};
    } catch(e) {
        console.log('Error adding shifts to GCal: ', e.message);
        return {status: 500, message: 'Error adding shifts to GCal'};
    }
};

export default {
    getUserInfo,
    getUserEvents,
    getAllUsersEvents,
    addEvent,
    addEvents,
    addDaysShiftsToGcal,
};