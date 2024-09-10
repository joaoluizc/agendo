const getLocalTimeframeISO = (date: string | number | Date) => {
    // Get today's date in local time
    const today = new Date(date);

    // Calculate the start and end of the day in local time
    const startOfDay = new Date(today.setHours(0, 0, 0, 0));
    const endOfDay = new Date(today.setHours(23, 59, 59, 999));

    // Convert the start and end of the day to UTC
    const startOfDayUTC = new Date(startOfDay.getTime() - (startOfDay.getTimezoneOffset() * 60000));
    const endOfDayUTC = new Date(endOfDay.getTime() - (endOfDay.getTimezoneOffset() * 60000));

    // Convert to ISO string
    const startOfDayISO = startOfDayUTC.toISOString();
    const endOfDayISO = endOfDayUTC.toISOString();
    
    const todayISO = `${startOfDayISO}/${endOfDayISO}`;
    return todayISO;
}


export default {
    getLocalTimeframeISO,
};