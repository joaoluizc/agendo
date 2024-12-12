const slingShiftsExample = [
  {
    id: 9268579,
    type: "user",
    origin: null,
    name: "Dorit",
    legalName: "Dorit",
    preferredName: null,
    lastname: "Gerstenfeld",
    avatar:
      "https://res.cloudinary.com/gangverk/image/upload/b_rgb:b6b6b6/co_rgb:fff,l_text:Verdana_45_bold:DG/v1402073600/avatar_zvixqi.jpg",
    email: "dorit.gerstenfeld@duda.co",
    timezone: "Asia/Jerusalem",
    hoursCap: 0,
    active: true,
    deactivatedAt: null,
    timeclockEnabled: true,
    hasToastGuid: false,
    shifts: [
      {
        id: "3609582290",
        summary: "",
        status: "published",
        type: "shift",
        fullDay: false,
        openEnd: false,
        dtstart: "2024-12-02T05:00:00-03:00",
        dtend: "2024-12-02T06:00:00-03:00",
        approved: null,
        assigneeNotes: "",
        fromIntegration: null,
        user: {
          id: 9268579,
        },
        location: {
          id: 9483282,
        },
        position: {
          name: "Chats",
          color: "#00c49e",
          id: 9242948,
        },
        breakDuration: 0,
        available: false,
        slots: 1,
      },
      {
        id: "3609582288",
        summary: "",
        status: "published",
        type: "shift",
        fullDay: false,
        openEnd: false,
        dtstart: "2024-12-02T06:00:00-03:00",
        dtend: "2024-12-02T08:00:00-03:00",
        approved: null,
        assigneeNotes: "",
        fromIntegration: null,
        user: {
          id: 9268579,
        },
        location: {
          id: 9483282,
        },
        position: {
          name: "Phone/Callbacks",
          color: "#00CED1",
          id: 9242949,
        },
        breakDuration: 0,
        available: false,
        slots: 1,
      },
    ],
  },
];

const newShiftsExample = {
  user_2pEDzg4VKyZJEZbaqzDeFAsfUJx: [
    {
      _id: "674f0c1b024570b0bb4478e7",
      userId: "user_2pEDzg4VKyZJEZbaqzDeFAsfUJx",
      startTime: "2024-12-04T14:30:00.000Z",
      endTime: "2024-12-04T15:30:00.000Z",
      positionId: "674a33a0f091a9ed1b53c9c2",
      createdBy: "user_2pEDzg4VKyZJEZbaqzDeFAsfUJx",
      __v: 0,
    },
    {
      _id: "674f0fd9024570b0bb447906",
      userId: "user_2pEDzg4VKyZJEZbaqzDeFAsfUJx",
      startTime: "2024-12-04T15:00:00.000Z",
      endTime: "2024-12-04T16:00:00.000Z",
      positionId: "674a33a0f091a9ed1b53c99c",
      createdBy: "user_2pEDzg4VKyZJEZbaqzDeFAsfUJx",
      __v: 0,
    },
  ],
};

export function mergeShiftsFromSling(newShifts, slingShifts) {
  console.log("Starting mergeShiftsFromSling function");
  console.log("slingShifts:", slingShifts);

  // Deep clone new shifts to avoid mutations
  const mergedShifts = JSON.parse(JSON.stringify(newShifts));
  console.log("Cloned newShifts:", mergedShifts);

  // Process each day from sling shifts
  slingShifts.forEach((dayShifts) => {
    console.log("Processing dayShifts:", dayShifts);

    // Process each shift in the day
    dayShifts.shifts.forEach((slingShift) => {
      console.log("Processing slingShift:", slingShift);
      const userId = `sling_${slingShift.user.id}`; // Prefix to avoid conflicts

      // Create shift in new format
      const formattedShift = {
        _id: `sling_${slingShift.id}`,
        userId,
        startTime: slingShift.dtstart,
        endTime: slingShift.dtend,
        positionId: `sling_${slingShift.position.id}`,
        createdBy: "sling",
        __v: 0,
      };
      console.log("Formatted shift:", formattedShift);

      // Initialize array for user if doesn't exist
      if (!mergedShifts[userId]) {
        mergedShifts[userId] = [];
        console.log(`Initialized array for userId: ${userId}`);
      }

      // Add shift to user's array
      mergedShifts[userId].push(formattedShift);
      console.log(`Added shift to userId: ${userId}`);
    });
  });

  console.log("Final mergedShifts:", mergedShifts);
  return mergedShifts;
}
