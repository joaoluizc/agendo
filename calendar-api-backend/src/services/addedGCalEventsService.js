import UsersGCalEvents from "../models/GCalEventModel.js";

const addEvents = async (user, events, requestId = "req-id-nd") => {
  const userEvents = await UsersGCalEvents.findOne({ userId: user.id });
  if (userEvents) {
    userEvents.events.push(...events);
    await userEvents.save();
  } else {
    console.log(
      `[${requestId}] No events found for user ${user.email} with id ${user.id}, creating new UserGCalEvents`
    );
    const newUserEvents = new UsersGCalEvents({
      userId: user.id,
      events: events,
    });
    await newUserEvents.save();
    console.log(
      `[${requestId}] Added ${events.length} events on UserGCalEvents to user ${user.email} with id ${user.id}`
    );
  }
};

const addEvents_cl = async (user, events, requestId = "req-id-nd") => {
  const userEvents = await UsersGCalEvents.findOne({ userId: user.id });
  if (userEvents) {
    userEvents.events.push(...events);
    await userEvents.save();
  } else {
    console.log(
      `[${requestId}] No events found for user ${user.firstName} with id ${user.id}, creating new UserGCalEvents`
    );
    const newUserEvents = new UsersGCalEvents({
      userId: user.id,
      events: events,
    });
    await newUserEvents.save();
    console.log(
      `[${requestId}] Added ${events.length} events on UserGCalEvents to user ${user.firstName} with id ${user.id}`
    );
  }
};

const findEventsByDate = async (date, requestId = "req-id-nd") => {
  // Get the date in YYYY-MM-DD format
  const adjustedDate = date.split("T")[0];
  // Calculate the start and end of the day in ISO format
  const startOfDay = new Date(adjustedDate + "T00:00:00.000Z");
  const endOfDay = new Date(adjustedDate + "T23:59:59.999Z");

  try {
    // Use aggregation to filter events array by date, parsing dateTime string to Date
    const usersWithEvents = await UsersGCalEvents.aggregate([
      {
        $project: {
          userId: 1,
          events: 1,
        },
      },
      {
        $addFields: {
          events: {
            $filter: {
              input: "$events",
              as: "event",
              cond: {
                $let: {
                  vars: {
                    eventDate: {
                      $cond: [
                        { $eq: [{ $type: "$$event.start.dateTime" }, "date"] },
                        "$$event.start.dateTime",
                        {
                          $dateFromString: {
                            dateString: "$$event.start.dateTime",
                          },
                        },
                      ],
                    },
                  },
                  in: {
                    $and: [
                      { $gte: ["$$eventDate", startOfDay] },
                      { $lte: ["$$eventDate", endOfDay] },
                    ],
                  },
                },
              },
            },
          },
        },
      },
      {
        $match: {
          "events.0": { $exists: true },
        },
      },
    ]);

    console.log(
      `[${requestId}] findEventsByDate: Total users with events for date ${date}: ${usersWithEvents.length} users found`
    );

    return usersWithEvents;
  } catch (error) {
    console.error(
      `[${requestId}] findEventsByDate: Error fetching events: ${error.message}`
    );
    return [];
  }
};

const deleteEvents = async (userId, events, requestId = "req-id-nd") => {
  const userEvents = await UsersGCalEvents.findOne({ userId });
  if (userEvents) {
    const eventsToDelete = events.map((event) => event.id);
    userEvents.events = userEvents.events.filter(
      (event) => !eventsToDelete.includes(event.id)
    );
    await userEvents.save();
    console.log(
      `[${requestId}] addedGCalEventsService: Deleted ${events.length} events on UserGCalEvents for user with id ${userId}`
    );
  } else {
    console.log(
      `[${requestId}] addedGCalEventsService: No events found for user with id ${userId}`
    );
  }
};

export default {
  addEvents: addEvents,
  addEvents_cl,
  findEventsByDate,
  deleteEvents,
};
