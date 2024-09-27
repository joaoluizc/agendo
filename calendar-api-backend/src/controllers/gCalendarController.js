import dotenv from 'dotenv';
import express from 'express';
import { google } from 'googleapis';
import cron from 'node-cron';
import process from 'process';
import gCalendarService from '../services/gCalendarService.js';
import userService from '../services/userService.js';
import redirectStateService from '../services/redirectStateService.js';
import slingController from './slingController.js';
import utils from '../utils/utils.js';
import verifyUserAuth from '../middlewares/verifyUserAuth.js';

dotenv.config();

const SCOPES = [
    'https://www.googleapis.com/auth/calendar',
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/userinfo.profile'
  ];

const gCalendarRouter = express.Router();

const getOAuth2Client = (tokens) => {
    const oauth2Client = new google.auth.OAuth2(process.env.CLIENT_ID, process.env.SECRET_ID, process.env.REDIRECT);
    oauth2Client.setCredentials(tokens);
    return oauth2Client;
};

gCalendarRouter.get('/login', verifyUserAuth, async (req, res) => {
    console.log(`GCalendar login 1.1: Authenticating user ${req.user.email} with Google OAuth2`);
    const oauth2Client = new google.auth.OAuth2(process.env.CLIENT_ID, process.env.SECRET_ID, process.env.REDIRECT);
    const state = await redirectStateService.createState(req.user.email); // Generate a unique session identifier
    req.session.oauthState = state; // Store the state in the user's session
    console.log(`GCalendar login 1.2: Generated state session ${state} for user ${req.user.email}`);

    const url = oauth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: SCOPES,
        state: state, // Include the state parameter
    });
    console.log(`GCalendar login 1.3: Redirecting user ${req.user.email} to Google OAuth2 login page: ${url}`);
    res.status(200).json({ ssoUrl: url });
});

gCalendarRouter.get('/redirect', async (req, res) => {
    console.log(`GCalendar login 2.1: Starting callback processes for Google OAuth2 login`);
    const code = req.query.code;
    console.log(`GCalendar login 2.2: Received code ${code} from Google OAuth2 login page`);
    const state = req.query.state;
    console.log(`GCalendar login 2.3: Received state ${state} from Google OAuth2 login page`);

    // Validate the state parameter between session and query
    // if (state !== req.session.oauthState) {
    //     console.log(`GCalendar login error: Invalid state parameter. Mismatch between state ${state} and oauthState ${req.session.oauthState}`);
    //     return res.status(401).send('Invalid state parameter');
    // }

    // Find the user's email from the state parameter
    const foundState = await redirectStateService.findState(state);
    if (!foundState) {
        console.log(`GCalendar login error: Couldn't find state ${state}`);
        return res.status(401).send('Invalid state parameter');
    }
    const email = foundState.userEmail;
    console.log(`GCalendar login 2.4: Found email ${email} for state ${state}`);

    // Cleanup found state
    redirectStateService.removeState(state);
    console.log(`GCalendar login 2.5: Removed state ${state} from database for cleanup`);

    const oauth2Client = new google.auth.OAuth2(process.env.CLIENT_ID, process.env.SECRET_ID, process.env.REDIRECT);
    oauth2Client.getToken(code, async (err, tokens) => {
        if (err) {
            console.log(`GCalendar login error: Couldn't get token`, err);
            return res.send('Error');
        }
        console.log(`GCalendar login 2.6: Received tokens for user ${email}: ${tokens}`);
        oauth2Client.setCredentials(tokens);
        await userService.addGapiToken(email, tokens);
        console.log(`GCalendar login 2.2: User ${email} authenticated with Google OAuth2. Redirecting back to frontend on ${process.env.REDIRECT_FRONTEND}`);
        res.redirect(process.env.REDIRECT_FRONTEND);
    });
});

gCalendarRouter.get('/userinfo', verifyUserAuth,  async (req, res) => {
    console.log(`UserInfo 1: Fetching user info for ${req.user.email}`);
    const tokens = await userService.getGapiToken(req.user.email);
    if (!tokens) {
        console.log(`UserInfo 2: User ${req.user.email} not authenticated with Google`);
        return res.status(204).send('User not authenticated with Google');
    }
    const response = await fetch('https://www.googleapis.com/oauth2/v1/userinfo?alt=json', {
        headers: {
            Authorization: `Bearer ${tokens.access_token}`,
        },
    });
    const data = await response.json();
    console.log(`UserInfo 3: User info fetched for ${req.user.email}`);
    res.status(200).json(data);
});

gCalendarRouter.post('/disconnect',  verifyUserAuth, async (req, res) => {
    console.log(`Disconnecting user ${req.user.email} from Google OAuth2`);
    await userService.addGapiToken(req.user.email, null);
    console.log(`User ${req.user.email} disconnected from Google OAuth2`);
    res.status(200).send('Disconnected');
});

gCalendarRouter.get('/calendars', verifyUserAuth,  async (req, res) => {
    const tokens = await userService.getGapiToken(req.user.email);  // Retrieve tokens from the user service
    if (!tokens) {
        return res.status(401).send('User not authenticated');
    }
    const oauth2Client = getOAuth2Client(tokens);
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
    calendar.calendarList.list({}, (err, response) => {
        if (err) {
            console.log('Error fetching calendars', err);
            res.send('Error');
        }
        const calendars = response.data.items;
        res.json(calendars);
    });
});

gCalendarRouter.get('/events', verifyUserAuth,  async (req, res) => {
    console.log(`Fetching GCalendar events for ${req.user.email}`);
    const tokens = await userService.getGapiToken(req.user.email);  // Retrieve tokens from the user service
    if (!tokens) {
        return res.status(401).send('User not Google authenticated');
    }
    const calendarId = req.query.calendar ?? 'primary';
    const oauth2Client = getOAuth2Client(tokens);
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
    calendar.events.list({
        calendarId,
        timeMin: (new Date()).toISOString(),
        maxResults: 50,
        singleEvents: true,
        orderBy: 'startTime',
    }, (err, response) => {
        if (err) {
            console.log(`Can't fetch events`, err);
            return res.send('Error');
        }
        console.log(`GCal fetch successful: ${response.data.items.length} events`);
        console.log(response.data.items);
        const events = response.data.items;
        res.json(events);
    });
});

gCalendarRouter.get('/all-events verifyUserAuth, ', async (req, res) => {
    const date = new Date(req.query.date.split('/')[0]);
    console.log(`Fetching GCalendar events for ${req.user.email} on date ${date}`);
    try {
        const events = await gCalendarService.getAllUsersEvents(date);

        if (Array.isArray(events) && events.length > 0) {
            console.log(`GCal fetch successful for date ${date}: ${events.length} events`);
            // console.log(events);
            res.status(200).json(events);
        } else {
            console.warn('No events found');
            res.status(204).json({ message: 'No events found' });
        }
    } catch (error) {
        console.error('Error fetching all user events:', error);
        res.status(500).json({ error: 'Failed to fetch events' });
    }
});

gCalendarRouter.post('/all-shifts-to-gcal', verifyUserAuth, async (req, res) => {
    const date = req.body.date ? utils.todayISO(req.body.date) : utils.todayISO(new Date());
    console.log(`gCalendarController 1: Adding all shifts to GCal for date ${date}. Request from user ${req.user.email}`);
    try {
        const calendar = await slingController.getCalendar(date);
        console.log(`gCalendarController 2: Found ${calendar.length} shifts for date ${date}`);
        const usersWithGoogle = await userService.getAllUsersWithTokens();
        console.log(`gCalendarController 3: Found ${usersWithGoogle.length} users authenticated with Google`);
        usersWithGoogle.forEach(async (user) => {
            const slingUser = calendar.filter(slingUserCal => Number(slingUserCal.id) === Number(user.slingId))[0];
            if (!slingUser) {
                console.log(`Found no shifts for user ${user.email}, no event was added to calendar`);
                res.status(200).json({ message: 'No shifts found for user, no event was added to calendar' });
                return;
            }
            const userShifts = slingUser.shifts;
            console.log(`gCalendarController 4: Found ${userShifts.length} shifts for user ${user.email}`);

            console.log(`gCalendarController 5: Filtering shifts for user ${user.email} to what user wants to sync`);
            const positionsToSync = user.positionsToSync.map(position => position.positionId.toString());
            const shiftsToAdd = userShifts.filter(event => positionsToSync.includes(event.position.id.toString()));
            const userEvents = shiftsToAdd.map(shift => utils.shiftToEvent(shift));

            console.log(`gCalendarController 6: Adding ${userEvents.length} shifts to GCal for ${user.email} on date ${date}`);
            userEvents.forEach(async (event) => await gCalendarService.addEvent(user, event));
        });
        res.status(200).json();
    } catch(e) {
        console.log('Error adding shifts to GCal: ', e.message);
    }
});

gCalendarRouter.get('/', (req, res) => res.status(200).json({ message: 'hey there :-))))' }));

// Cron job to check and refresh gapi tokens every 30 minutes
cron.schedule('*/30 * * * *', async () => {
    console.log('Running cron job to check and refresh tokens');
    const users = await userService.getAllUsersWithTokens();
    users.forEach(async (user) => {
        const { email, tokens } = user;
        const oauth2Client = getOAuth2Client(tokens);

        // Check if the token is about to expire in the next 10 minutes
        const expirationTime = tokens.expiry_date;
        const currentTime = new Date().getTime();
        const sixtyMinutes = 60 * 60 * 1000;

        if (expirationTime - currentTime < sixtyMinutes) {
            console.log(`Refreshing token for user: ${email}`);
            oauth2Client.refreshAccessToken(async (err, newTokens) => {
                if (err) {
                    console.error(`Error refreshing token for user: ${email}`, err);
                } else {
                    await userService.addGapiToken(email, newTokens);
                    console.log(`Token refreshed for user: ${email}`);
                }
            });
        }
    });
});

export default gCalendarRouter;
