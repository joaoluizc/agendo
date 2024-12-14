const getLocalTimeframeISOld = (date: string | number | Date) => {
    console.log(`Received date: ${date}`);

    // Get today's date in local time
    const today = new Date(date);
    console.log(`Today's date in local time: ${today}`);

    // Calculate the start and end of the day in local time
    const startOfDay = new Date(today.setHours(0, 0, 0, 0));
    console.log(`Start of the day in local time: ${startOfDay}`);
    const endOfDay = new Date(today.setHours(23, 59, 59, 999));
    console.log(`End of the day in local time: ${endOfDay}`);

    // Convert the start and end of the day to UTC
    const startOfDayUTC = new Date(startOfDay.getTime() - (startOfDay.getTimezoneOffset() * 60000));
    console.log(`Start of the day in UTC: ${startOfDayUTC}`);
    const endOfDayUTC = new Date(endOfDay.getTime() - (endOfDay.getTimezoneOffset() * 60000));
    console.log(`End of the day in UTC: ${endOfDayUTC}`);

    // Convert to ISO string
    const startOfDayISO = startOfDayUTC.toISOString();
    console.log(`Start of the day ISO string: ${startOfDayISO}`);
    const endOfDayISO = endOfDayUTC.toISOString();
    console.log(`End of the day ISO string: ${endOfDayISO}`);
    
    const todayISO = `${startOfDayISO}/${endOfDayISO}`;
    console.log(`Combined ISO string: ${todayISO}`);
    
    return {todayISO, startOfDayISO, endOfDayISO};
}

const getLocalTimeframeISO = (date: string | number | Date) => {
    console.log(`Received date: ${date}`);
  
    // Get the provided date in local time
    const today = new Date(date);
    console.log(`Today's date in local time: ${today}`);
  
    // Calculate the start and end of the day in local time
    const startOfDay = new Date(today);
    // startOfDay.setDate(today.getDate() - 1); // Set to one day before
    startOfDay.setHours(0, 0, 0, 0);
    console.log(`Start of the day in local time: ${startOfDay}`);
  
    const endOfDay = new Date(today);
    endOfDay.setHours(23, 59, 59, 0);
    console.log(`End of the day in local time: ${endOfDay}`);
  
    // Convert to ISO string
    const startOfDayISO = startOfDay.toISOString();
    console.log(`Start of the day ISO string: ${startOfDayISO}`);
    const endOfDayISO = endOfDay.toISOString();
    console.log(`End of the day ISO string: ${endOfDayISO}`);
    
    const todayISO = `${startOfDayISO}/${endOfDayISO}`;
    console.log(`Combined ISO string: ${todayISO}`);
    
    return { todayISO, startOfDayISO, endOfDayISO };
  };

export default {
    getLocalTimeframeISO,
    getLocalTimeframeISOld,
};