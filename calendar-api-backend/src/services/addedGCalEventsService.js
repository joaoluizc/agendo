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
  const adjustedDate = date.split("T")[0];

  try {
    const allEvents = await UsersGCalEvents.find();

    const prevAddedEvents = allEvents.map((userEvents) => {
      const events = userEvents.events;

      const eventsOnDate = events.filter((event) => {
        const matchesDate = String(
          new Date(event.start.dateTime).toISOString()
        ).includes(adjustedDate);
        return matchesDate;
      });

      userEvents.events = [...eventsOnDate];
      if (eventsOnDate.length > 0) {
        return userEvents;
      }

      return null;
    });

    console.log(
      `[${requestId}] findEventsByDate: Total users with events for date ${date}: ${prevAddedEvents.length} users found`
    );

    return prevAddedEvents;
  } catch (error) {
    console.error(
      `[${requestId}] findEventsByDate: Error fetching events: ${error.message}`
    );
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
