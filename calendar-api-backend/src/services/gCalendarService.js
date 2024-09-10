import dotenv from 'dotenv';
import userService from './userService.js';
import { google } from 'googleapis';
import process from 'process';

dotenv.config();


const getOAuth2Client = (tokens) => {
    const oauth2Client = new google.auth.OAuth2(process.env.CLIENT_ID, process.env.SECRET_ID, process.env.REDIRECT);
    oauth2Client.setCredentials(tokens);
    return oauth2Client;
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

export default {
    getUserEvents,
    getAllUsersEvents,
    addEvent,
    addEvents,
};