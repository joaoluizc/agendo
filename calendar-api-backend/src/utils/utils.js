const todayISO = (date) => {
    // Get today's date
    console.log('checkpoint 1: ', date);
    const today = new Date(date);
    console.log('checkpoint 2: ', today);
    today.setHours(0, 0, 0, 0); // Set the time to midnight (00:00:00.000)
    console.log('checkpoint 3: ', today);

    // Convert to ISO string
    const startOfDayISO = today.toISOString();
    console.log('checkpoint 4: ', startOfDayISO);

    // Create a Date object for 24 hours later
    const endOfDay = new Date(today);
    endOfDay.setHours(24, 0, 0, 0); // Set the time to 24 hours later (midnight next day)

    // Convert to ISO string
    const endOfDayISO = endOfDay.toISOString();

    return `${startOfDayISO}/${endOfDayISO}`;
}

const shiftToEvent = (shift) => {
    const event = {
        summary: shift.position.name,
        // description: 'optional',
        start: {
            dateTime: shift.dtstart,
            timeZone: 'Brazil/East'
        },
        end: {
            dateTime: shift.dtend,
            timeZone: 'Brazil/East'
        },
    };
    return event;
};

export default {
    todayISO,
    shiftToEvent,
};