const todayISO = (date: string | number | Date) => {
    // Get today's date
    const today = new Date(date);
    today.setUTCHours(0, 0, 0, 1); // Set the time to midnight (00:00:00.000)

    // Convert to ISO string
    const startOfDayISO = today.toISOString();

    // Create a Date object for 24 hours later
    const endOfDay = new Date(today);
    endOfDay.setUTCHours(23, 59, 0, 0); // Set the time to 24 hours later (midnight next day)

    // Convert to ISO string
    const endOfDayISO = endOfDay.toISOString();

    return `${startOfDayISO}/${endOfDayISO}`;
}

const authorization = {
    'Authorization': '2d5a372ef3c544a689115a05868a5d9f',
};

export default {
    todayISO,
    authorization,
};