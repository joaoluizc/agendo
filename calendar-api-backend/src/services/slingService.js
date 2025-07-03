import dotenv from "dotenv";
import fetch from "node-fetch";
import process from "process";
import positionService from "./positionService.js";

dotenv.config();

class SlingService {
  constructor() {
    this.sessionData = null;
    this.user = null;
    this.positions = null;
    this.users = null;
  }

  async init() {
    await this.fetchSessionData();
    this.positions = await this.getAllPositions();
    this.users = await this.getAllUsers();
  }

  async fetchSessionData() {
    const response = await fetch(
      "https://api.getsling.com/v1/account/session",
      {
        method: "GET",
        headers: {
          Authorization: process.env.SLING_AUTHORIZATION,
        },
      }
    );
    if (!response.ok) {
      throw new Error("Error fetching session data");
    }
    this.sessionData = await response.json();
    this.user = this.sessionData.user;
    console.log(
      `Hello ${this.user.legalName} ${this.user.lastname}! Your user_ID IS ${this.user.id} and your org_id is ${this.user.orgs[0].id} (${this.user.orgs[0].name}).`
    );
  }

  async getAllPositions() {
    const endpoint = "https://api.getsling.com/v1/groups?type=position";
    const options = {
      method: "GET",
      headers: {
        Authorization: process.env.SLING_AUTHORIZATION,
      },
    };

    const response = await fetch(endpoint, options);
    if (!response.ok) {
      throw new Error("Error fetching positions");
    }
    const data = await response.json();
    const mappedPositions = await positionService.getPositions();

    return data.reduce((acc, curr) => {
      acc[curr.id] = {};
      acc[curr.id].name = curr.name;
      const mappedPosition = mappedPositions.find(
        (position) => String(position.positionId) === String(curr.id)
      );
      acc[curr.id].color = mappedPosition
        ? mappedPosition.color
        : "#" + ((Math.random() * 0xffffff) << 0).toString(16).padStart(6, "0");
      acc[curr.id].id = curr.id;
      return acc;
    }, {});
  }

  async getAllUsers() {
    const endpoint = "https://api.getsling.com/v1/users";
    const options = {
      method: "GET",
      headers: {
        Authorization: process.env.SLING_AUTHORIZATION,
      },
    };

    const response = await fetch(endpoint, options);
    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Error fetching users: ${error.message}`);
    }
    const data = await response.json();

    return data.reduce((acc, curr) => {
      acc[curr.id] = curr;
      return acc;
    }, {});
  }

  async updatePositions() {
    this.positions = await this.getAllPositions();
  }

  async fetchTodaysCalendar(date) {
    const orgId = parseInt(this.user.orgs[0].id);
    const userId = this.user.id;
    const endpoint = `https://api.getsling.com/v1/calendar/${orgId}/users/${userId}?dates=${date}&eventTypes=shift`;
    const options = {
      method: "GET",
      headers: {
        Authorization: process.env.SLING_AUTHORIZATION,
      },
    };

    const response = await fetch(endpoint, options);
    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Error fetching calendar: ${error.message}`);
    }

    const calendarData = await response.json();
    return calendarData.filter((shift) => shift.status === "published");
  }

  sortCalendarByUser(calendar) {
    const sortedCalendar = calendar.reduce((acc, curr) => {
      curr.position = this.positions[curr.position.id];
      if (!acc[curr.user.id]) {
        acc[curr.user.id] = [];
      }
      acc[curr.user.id].push(curr);
      return acc;
    }, {});
    const sortedWithUserInfo = Object.keys(sortedCalendar).map((userId) => {
      return {
        ...this.users[userId],
        shifts: sortedCalendar[userId],
      };
    });
    return sortedWithUserInfo;
  }
}

export default SlingService;
