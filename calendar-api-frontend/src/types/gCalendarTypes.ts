export type Attendee = {
    email: string;
    displayName?: string;
    organizer?: boolean;
    responseStatus: string;
    self?: boolean;
};

export type ConferenceData = {
    entryPoints: Array<{
        entryPointType: string;
        uri: string;
        label?: string;
        pin?: string;
        regionCode?: string;
    }>;
    conferenceSolution: {
        key: {
            type: string;
        };
        name: string;
        iconUri: string;
    };
    conferenceId: string;
};

export type GCalendarEvent = {
    kind: string;
    etag: string;
    id: string;
    status: string;
    htmlLink: string;
    created: string;
    updated: string;
    summary: string;
    description?: string;
    location?: string;
    creator: {
        email: string;
        self?: boolean;
    };
    organizer: {
        email: string;
        self?: boolean;
    };
    start: {
        date: string;
        dateTime: string;
        timeZone?: string;
    };
    end: {
        date: string;
        dateTime: string;
        timeZone?: string;
    };
    recurringEventId?: string;
    originalStartTime?: {
        date?: string;
        dateTime?: string;
        timeZone?: string;
    };
    transparency?: string;
    visibility?: string;
    iCalUID: string;
    sequence: number;
    attendees?: Attendee[];
    hangoutLink?: string;
    conferenceData?: ConferenceData;
    reminders: {
        useDefault: boolean;
    };
    eventType: string;
    guestsCanModify?: boolean;
    guestsCanInviteOthers?: boolean;
    workingLocationProperties?: {
        type: string;
        homeOffice: Record<string, unknown>;
    };
    gridRowNumber?: number;
};

export type GCalendarEventList = GCalendarEvent[];

export type FetchedCalendarUser = {
    email: string;
    slingId: string;
    userId: string;
    events: GCalendarEventList;
};

export type CalendarUser = {
    email: string;
    slingId: string;
    userId: string;
    numberOfEventOverlaps: number;
    events: GCalendarEventList;
};

export const initialGCalendarEventList: GCalendarEvent[] = [
    {
        kind: "calendar#event",
        etag: "\"etag-placeholder-1\"",
        id: "event-id-placeholder-1",
        status: "confirmed",
        htmlLink: "https://www.google.com/calendar/event?eid=event-id-placeholder-1",
        created: "2024-01-01T00:00:00.000Z",
        updated: "2024-01-01T00:00:00.000Z",
        summary: "Sample Event 1",
        creator: {
            email: "creator1@example.com",
            self: true
        },
        organizer: {
            email: "organizer1@example.com",
            self: true
        },
        start: {
            date: "2024-07-08",
            dateTime: "2024-07-08T09:00:00-03:00"
        },
        end: {
            date: "2024-07-09",
            dateTime: "2024-07-08T10:00:00-03:00"
        },
        recurringEventId: "recurring-event-id-placeholder-1",
        originalStartTime: {
            date: "2024-07-08"
        },
        transparency: "transparent",
        visibility: "public",
        iCalUID: "ical-uid-placeholder-1",
        sequence: 0,
        reminders: {
            useDefault: false
        },
        workingLocationProperties: {
            type: "homeOffice",
            homeOffice: {}
        },
        eventType: "workingLocation"
    },
    {
        kind: "calendar#event",
        etag: "\"etag-placeholder-2\"",
        id: "event-id-placeholder-2",
        status: "confirmed",
        htmlLink: "https://www.google.com/calendar/event?eid=event-id-placeholder-2",
        created: "2024-01-01T00:00:00.000Z",
        updated: "2024-01-01T00:00:00.000Z",
        summary: "Sample Event 2",
        creator: {
            email: "creator2@example.com"
        },
        organizer: {
            email: "organizer2@example.com"
        },
        start: {
            dateTime: "2024-07-08T09:00:00-03:00",
            date: "2024-07-08"
        },
        end: {
            dateTime: "2024-07-08T10:00:00-03:00",
            date: "2024-07-08"
        },
        recurringEventId: "recurring-event-id-placeholder-2",
        originalStartTime: {
            dateTime: "2024-07-08T09:00:00-03:00",
            timeZone: "America/Sao_Paulo"
        },
        iCalUID: "ical-uid-placeholder-2",
        sequence: 1,
        attendees: [
            {
                email: "attendee1@example.com",
                organizer: true,
                responseStatus: "accepted"
            },
            {
                email: "attendee2@example.com",
                displayName: "Attendee 2",
                responseStatus: "needsAction"
            },
            {
                email: "attendee3@example.com",
                self: true,
                responseStatus: "needsAction"
            }
        ],
        hangoutLink: "https://meet.google.com/placeholder",
        conferenceData: {
            entryPoints: [
                {
                    entryPointType: "video",
                    uri: "https://meet.google.com/placeholder",
                    label: "meet.google.com/placeholder"
                },
                {
                    entryPointType: "more",
                    uri: "https://tel.meet/placeholder?pin=1234567890",
                    pin: "1234567890"
                },
                {
                    regionCode: "US",
                    entryPointType: "phone",
                    uri: "tel:+1-800-555-5555",
                    label: "+1 800-555-5555",
                    pin: "1234567890"
                }
            ],
            conferenceSolution: {
                key: {
                    type: "hangoutsMeet"
                },
                name: "Google Meet",
                iconUri: "https://fonts.gstatic.com/s/i/productlogos/meet_2020q4/v6/web-512dp/logo_meet_2020q4_color_2x_web_512dp.png"
            },
            conferenceId: "conference-id-placeholder"
        },
        reminders: {
            useDefault: true
        },
        eventType: "default"
    }
];

// export const initialCalendarUser: CalendarUser[] = [{
//     email: "email@email.com",
//     slingId: "sling-id-placeholder",
//     events: initialGCalendarEventList
// }];
