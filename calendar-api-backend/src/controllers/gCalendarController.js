import dotenv from 'dotenv';
import express from 'express';
import { google } from 'googleapis';
import userService from '../services/userService.js';
import cron from 'node-cron';

dotenv.config();

const gCalendarRouter = express.Router();

const getOAuth2Client = (tokens) => {
    const oauth2Client = new google.auth.OAuth2(process.env.CLIENT_ID, process.env.SECRET_ID, process.env.REDIRECT);
    oauth2Client.setCredentials(tokens);
    return oauth2Client;
};

gCalendarRouter.get('/login', (req, res) => {
    const oauth2Client = new google.auth.OAuth2(process.env.CLIENT_ID, process.env.SECRET_ID, process.env.REDIRECT);
    const url = oauth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: 'https://www.googleapis.com/auth/calendar.readonly',
    });
    res.status(200).json({ ssoUrl: url });
});

gCalendarRouter.get('/redirect', (req, res) => {
    const code = req.query.code;
    const oauth2Client = new google.auth.OAuth2(process.env.CLIENT_ID, process.env.SECRET_ID, process.env.REDIRECT);
    oauth2Client.getToken(code, async (err, tokens) => {
        if (err) {
            console.log(`Couldn't get token`, err);
            return res.send('Error');
        }
        oauth2Client.setCredentials(tokens);
        await userService.addGapiToken(req.user.email, tokens);  // Store tokens in the user service
        res.redirect('http://localhost:5173/');
    });
});

gCalendarRouter.get('/calendars', async (req, res) => {
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

gCalendarRouter.get('/events', async (req, res) => {
    const tokens = await userService.getGapiToken(req.user.email);  // Retrieve tokens from the user service
    if (!tokens) {
        return res.status(401).send('User not authenticated');
    }
    const calendarId = req.query.calendar ?? 'primary';
    const oauth2Client = getOAuth2Client(tokens);
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
    calendar.events.list({
        calendarId,
        timeMin: (new Date()).toISOString(),
        maxResults: 15,
        singleEvents: true,
        orderBy: 'startTime',
    }, (err, response) => {
        if (err) {
            console.log(`Can't fetch events`, err);
            return res.send('Error');
        }
        const events = response.data.items;
        res.json(events);
    });
});

gCalendarRouter.get('/', (req, res) => res.status(200).json({ message: 'hey there :-))))' }));

export default gCalendarRouter;
