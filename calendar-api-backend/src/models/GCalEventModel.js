import mongoose from "mongoose";
const { Schema } = mongoose;

export const GCalEventSchema = new Schema({
  kind: { type: String, default: "calendar#event" },
  etag: String,
  id: String,
  status: String,
  htmlLink: String,
  created: Date,
  updated: Date,
  summary: String,
  description: String,
  location: String,
  colorId: String,
  creator: {
    id: String,
    email: String,
    displayName: String,
    self: Boolean,
  },
  organizer: {
    id: String,
    email: String,
    displayName: String,
    self: Boolean,
  },
  start: {
    date: Date,
    dateTime: Date,
    timeZone: String,
  },
  end: {
    date: Date,
    dateTime: Date,
    timeZone: String,
  },
  endTimeUnspecified: Boolean,
  recurrence: [String],
  recurringEventId: String,
  originalStartTime: {
    date: Date,
    dateTime: Date,
    timeZone: String,
  },
  transparency: String,
  visibility: String,
  iCalUID: String,
  sequence: Number,
  attendees: [
    {
      id: String,
      email: String,
      displayName: String,
      organizer: Boolean,
      self: Boolean,
      resource: Boolean,
      optional: Boolean,
      responseStatus: String,
      comment: String,
      additionalGuests: Number,
    },
  ],
  attendeesOmitted: Boolean,
  extendedProperties: {
    private: Map,
    shared: Map,
  },
  hangoutLink: String,
  conferenceData: {
    createRequest: {
      requestId: String,
      conferenceSolutionKey: {
        type: String,
      },
      status: {
        statusCode: String,
      },
    },
    entryPoints: [
      {
        entryPointType: String,
        uri: String,
        label: String,
        pin: String,
        accessCode: String,
        meetingCode: String,
        passcode: String,
        password: String,
      },
    ],
    conferenceSolution: {
      key: {
        type: String,
      },
      name: String,
      iconUri: String,
    },
    conferenceId: String,
    signature: String,
    notes: String,
  },
  gadget: {
    type: String,
    title: String,
    link: String,
    iconLink: String,
    width: Number,
    height: Number,
    display: String,
    preferences: Map,
  },
  anyoneCanAddSelf: Boolean,
  guestsCanInviteOthers: Boolean,
  guestsCanModify: Boolean,
  guestsCanSeeOtherGuests: Boolean,
  privateCopy: Boolean,
  locked: Boolean,
  reminders: {
    useDefault: Boolean,
    overrides: [
      {
        method: String,
        minutes: Number,
      },
    ],
  },
  source: {
    url: String,
    title: String,
  },
  workingLocationProperties: {
    type: String,
    homeOffice: Schema.Types.Mixed,
    customLocation: {
      label: String,
    },
    officeLocation: {
      buildingId: String,
      floorId: String,
      floorSectionId: String,
      deskId: String,
      label: String,
    },
  },
  outOfOfficeProperties: {
    autoDeclineMode: String,
    declineMessage: String,
  },
  focusTimeProperties: {
    autoDeclineMode: String,
    declineMessage: String,
    chatStatus: String,
  },
  attachments: [
    {
      fileUrl: String,
      title: String,
      mimeType: String,
      iconLink: String,
      fileId: String,
    },
  ],
  eventType: String,
  wasDeleted: Boolean,
});

const UsersGCalEventsSchema = new Schema({
  userId: String,
  events: [GCalEventSchema],
});

const UsersGCalEvents = mongoose.model(
  "UsersGCalEvents",
  UsersGCalEventsSchema
);

export default UsersGCalEvents;
