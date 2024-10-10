import UsersGCalEvents from "../models/GCalEventModel.js"

const addEvent = async (user, events) => {
    const userEvents = await UsersGCalEvents.findOne({ userId: user.id });
    console.log(`userEvents: ${userEvents}`);
    if(userEvents) {
        userEvents.events.push(...events);
        await userEvents.save();
        console.log(`Added ${events.length} events on UserGCalEvents to user ${user.email} with id ${user.id}`);
    } else {
        console.log(`No events found for user ${user.email} with id ${user.id}, creating new UserGCalEvents`);
        const newUserEvents = new UsersGCalEvents({
            userId: user.id,
            events: events,
        });
        await newUserEvents.save();
        console.log(`Added ${events.length} events on UserGCalEvents to user ${user.email} with id ${user.id}`);
    }
}

const findEventsByDate = async (date) => {
    console.log(`findEventsByDate: Starting findEventsByDate with date: ${date}`);
    const adjustedDate = date.split('T')[0];
    console.log(`findEventsByDate: Adjusted date: ${adjustedDate}`);
    
    try {
        const allEvents = await UsersGCalEvents.find();
        console.log(`findEventsByDate: Fetched all user events: ${allEvents.length} users found`);
        
        const prevAddedEvents = allEvents.map((userEvents) => {
            console.log(`findEventsByDate: Processing events for user: ${userEvents.userId}`);
            const events = userEvents.events;
            console.log(`findEventsByDate: Total events for user ${userEvents.userId}: ${events.length}`);
            
            const eventsOnDate = events.filter((event) => {
                console.log(`findEventsByDate: Checking event: ${JSON.stringify(event.id)} with start date: ${new Date(event.start.dateTime).toISOString()}`);
                const matchesDate = String(new Date(event.start.dateTime).toISOString()).includes(adjustedDate);
                console.log(`findEventsByDate: Event ${JSON.stringify(event.id)} matches date: ${matchesDate}`);
            });
            console.log(`findEventsByDate: Events for date ${date} for user ${userEvents.userId}: ${eventsOnDate.length} events found`);
            console.log(`findEventsByDate: Events details: ${JSON.stringify(eventsOnDate)}`);
            return eventsOnDate;
        });
        console.log(`findEventsByDate: Total events for date ${date}: ${prevAddedEvents.length} events found`);
        return prevAddedEvents;
    } catch (error) {
        console.error(`findEventsByDate: Error fetching events: ${error.message}`);
    }
}

export default {
    addEvent,
    findEventsByDate,
};