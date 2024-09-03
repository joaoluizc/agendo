const todayISO = (date) => {
    // Get today's date
    const today = new Date(date);
    today.setHours(0, 0, 0, 0); // Set the time to midnight (00:00:00.000)

    // Convert to ISO string
    const startOfDayISO = today.toISOString();

    // Create a Date object for 24 hours later
    const endOfDay = new Date(today);
    endOfDay.setHours(24, 0, 0, 0); // Set the time to 24 hours later (midnight next day)

    // Convert to ISO string
    const endOfDayISO = endOfDay.toISOString();

    return `${startOfDayISO}/${endOfDayISO}`;
}

export default {
    todayISO,
};