import SlingService from '../services/slingService.js';
import utils from "../utils/utils.js";

const slingService = new SlingService();
slingService.init();

const getCalendar = async (date) => {
    const selectedDate = date || utils.todayISO(new Date());
    const calendar = await slingService.fetchTodaysCalendar(selectedDate);
    const sortedCalendar = slingService.sortCalendarByUser(calendar);
    return sortedCalendar;
}

const getUsers = () => {
    return slingService.users;
}

const getPositions = () => {
    return slingService.positions;
}

export default {
    getCalendar,
    getUsers,
    getPositions,
};