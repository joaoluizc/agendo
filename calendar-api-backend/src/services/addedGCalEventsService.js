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

export default {
    addEvent,
};