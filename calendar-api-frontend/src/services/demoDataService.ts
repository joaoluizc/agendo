// Demo data service for constraint validation testing

export interface DemoUser {
  _id: string;
  firstName: string;
  lastName: string;
  email: string;
  type: string;
  timezone: string;
  skills: { _id: string; name: string }[];
  workHours: {
    dayOfWeek: number;
    startMinute: number;
    endMinute: number;
    isWorking: boolean;
  }[];
  dailyMaxLimit: number;
  weeklyMaxLimit: number;
  positionsToSync: any[];
}

export interface DemoPosition {
  _id: string;
  positionId: string;
  name: string;
  color: string;
  type: string;
  minTime: number;
  maxTime: number;
  stress: boolean;
  requiredSkills: string[];
}

class DemoDataService {
  private users: DemoUser[] = [];
  private positions: DemoPosition[] = [];
  private skills: { _id: string; name: string }[] = [];

  async fetchUsers(): Promise<DemoUser[]> {
    try {
      const response = await fetch("api/user/all");
      if (!response.ok) {
        throw new Error("Failed to fetch users");
      }

      const data = await response.json();
      this.users = data.map((user: any) => ({
        ...user,
        workHours: this.convertWorkHours(user.workHours || []),
        dailyMaxLimit: user.dailyMaxLimit || 480, // 8 hours default
        weeklyMaxLimit: user.weeklyMaxLimit || 2400, // 40 hours default
      }));

      return this.users;
    } catch (error) {
      console.error("Error fetching users:", error);
      // Return mock data as fallback
      return this.getMockUsers();
    }
  }

  async fetchPositions(): Promise<DemoPosition[]> {
    try {
      const response = await fetch("/api/position/all");
      if (!response.ok) {
        throw new Error("Failed to fetch positions");
      }

      const data = await response.json();
      this.positions = data.map((position: any, index: number) => ({
        ...position,
        minTime: position.minTime || 30,
        maxTime: position.maxTime || 480,
        stress: position.stress || false,
        requiredSkills:
          position.requiredSkills?.map((s: any) => s.name || s) || [],
        color: this.getPositionColor(index),
      }));

      return this.positions;
    } catch (error) {
      console.error("Error fetching positions:", error);
      // Return mock data as fallback
      return this.getMockPositions();
    }
  }

  async fetchSkills(): Promise<{ _id: string; name: string }[]> {
    try {
      const response = await fetch("/api/skills");
      if (!response.ok) {
        throw new Error("Failed to fetch skills");
      }

      const data = await response.json();
      this.skills = data;
      return this.skills;
    } catch (error) {
      console.error("Error fetching skills:", error);
      // Return mock data as fallback
      return this.getMockSkills();
    }
  }

  private convertWorkHours(workHours: any[]): DemoUser["workHours"] {
    if (!workHours || workHours.length === 0) {
      // Default work hours: Mon-Fri 9-17
      return [
        { dayOfWeek: 1, startMinute: 540, endMinute: 1020, isWorking: true }, // Mon 9-17
        { dayOfWeek: 2, startMinute: 540, endMinute: 1020, isWorking: true }, // Tue 9-17
        { dayOfWeek: 3, startMinute: 540, endMinute: 1020, isWorking: true }, // Wed 9-17
        { dayOfWeek: 4, startMinute: 540, endMinute: 1020, isWorking: true }, // Thu 9-17
        { dayOfWeek: 5, startMinute: 540, endMinute: 1020, isWorking: true }, // Fri 9-17
        { dayOfWeek: 6, startMinute: 0, endMinute: 0, isWorking: false }, // Sat
        { dayOfWeek: 0, startMinute: 0, endMinute: 0, isWorking: false }, // Sun
      ];
    }

    return workHours.map((wh) => ({
      dayOfWeek: wh.dayOfWeek || 0,
      startMinute: wh.startMinute || 0,
      endMinute: wh.endMinute || 0,
      isWorking: wh.isWorking || false,
    }));
  }

  private getPositionColor(index: number): string {
    const colors = [
      "#3B82F6", // Blue
      "#10B981", // Green
      "#F59E0B", // Orange
      "#6B7280", // Gray
      "#8B5CF6", // Purple
      "#EF4444", // Red
      "#06B6D4", // Cyan
      "#84CC16", // Lime
    ];
    return colors[index % colors.length];
  }

  private getMockUsers(): DemoUser[] {
    return [
      {
        _id: "user1",
        firstName: "Alice",
        lastName: "Johnson",
        email: "alice@company.com",
        type: "employee",
        timezone: "UTC",
        skills: [
          { _id: "skill1", name: "chat" },
          { _id: "skill2", name: "tickets" },
          { _id: "skill3", name: "escalation" },
        ],
        workHours: [
          { dayOfWeek: 1, startMinute: 540, endMinute: 1080, isWorking: true }, // Mon 9-18
          { dayOfWeek: 2, startMinute: 540, endMinute: 1080, isWorking: true }, // Tue 9-18
          { dayOfWeek: 3, startMinute: 540, endMinute: 1080, isWorking: true }, // Wed 9-18
          { dayOfWeek: 4, startMinute: 540, endMinute: 1080, isWorking: true }, // Thu 9-18
          { dayOfWeek: 5, startMinute: 540, endMinute: 1080, isWorking: true }, // Fri 9-18
          { dayOfWeek: 6, startMinute: 0, endMinute: 0, isWorking: false }, // Sat
          { dayOfWeek: 0, startMinute: 0, endMinute: 0, isWorking: false }, // Sun
        ],
        dailyMaxLimit: 480, // 8 hours
        weeklyMaxLimit: 2400, // 40 hours
        positionsToSync: [],
      },
      {
        _id: "user2",
        firstName: "Bob",
        lastName: "Smith",
        email: "bob@company.com",
        type: "employee",
        timezone: "UTC",
        skills: [
          { _id: "skill1", name: "chat" },
          { _id: "skill2", name: "tickets" },
        ],
        workHours: [
          { dayOfWeek: 1, startMinute: 600, endMinute: 1200, isWorking: true }, // Mon 10-20
          { dayOfWeek: 2, startMinute: 600, endMinute: 1200, isWorking: true }, // Tue 10-20
          { dayOfWeek: 3, startMinute: 600, endMinute: 1200, isWorking: true }, // Wed 10-20
          { dayOfWeek: 4, startMinute: 600, endMinute: 1200, isWorking: true }, // Thu 10-20
          { dayOfWeek: 5, startMinute: 600, endMinute: 1200, isWorking: true }, // Fri 10-20
          { dayOfWeek: 6, startMinute: 0, endMinute: 0, isWorking: false },
          { dayOfWeek: 0, startMinute: 0, endMinute: 0, isWorking: false },
        ],
        dailyMaxLimit: 480,
        weeklyMaxLimit: 2400,
        positionsToSync: [],
      },
      {
        _id: "user3",
        firstName: "Carol",
        lastName: "Davis",
        email: "carol@company.com",
        type: "employee",
        timezone: "UTC",
        skills: [
          { _id: "skill2", name: "tickets" },
          { _id: "skill3", name: "escalation" },
          { _id: "skill4", name: "break" },
        ],
        workHours: [
          { dayOfWeek: 1, startMinute: 480, endMinute: 1020, isWorking: true }, // Mon 8-17
          { dayOfWeek: 2, startMinute: 480, endMinute: 1020, isWorking: true }, // Tue 8-17
          { dayOfWeek: 3, startMinute: 480, endMinute: 1020, isWorking: true }, // Wed 8-17
          { dayOfWeek: 4, startMinute: 480, endMinute: 1020, isWorking: true }, // Thu 8-17
          { dayOfWeek: 5, startMinute: 480, endMinute: 1020, isWorking: true }, // Fri 8-17
          { dayOfWeek: 6, startMinute: 0, endMinute: 0, isWorking: false },
          { dayOfWeek: 0, startMinute: 0, endMinute: 0, isWorking: false },
        ],
        dailyMaxLimit: 480,
        weeklyMaxLimit: 2400,
        positionsToSync: [],
      },
    ];
  }

  private getMockPositions(): DemoPosition[] {
    return [
      {
        _id: "pos1",
        positionId: "pos1",
        name: "Chat Support",
        color: "#3B82F6",
        type: "chat",
        minTime: 30,
        maxTime: 480,
        stress: true,
        requiredSkills: ["chat"],
      },
      {
        _id: "pos2",
        positionId: "pos2",
        name: "Ticket Resolution",
        color: "#10B981",
        type: "tickets",
        minTime: 60,
        maxTime: 480,
        stress: false,
        requiredSkills: ["tickets"],
      },
      {
        _id: "pos3",
        positionId: "pos3",
        name: "Escalation Handler",
        color: "#F59E0B",
        type: "escalation",
        minTime: 120,
        maxTime: 480,
        stress: true,
        requiredSkills: ["escalation", "chat"],
      },
      {
        _id: "pos4",
        positionId: "pos4",
        name: "Break Time",
        color: "#6B7280",
        type: "break",
        minTime: 15,
        maxTime: 60,
        stress: false,
        requiredSkills: ["break"],
      },
    ];
  }

  private getMockSkills(): { _id: string; name: string }[] {
    return [
      { _id: "skill1", name: "chat" },
      { _id: "skill2", name: "tickets" },
      { _id: "skill3", name: "escalation" },
      { _id: "skill4", name: "break" },
    ];
  }

  getUsers(): DemoUser[] {
    return this.users;
  }

  getPositions(): DemoPosition[] {
    return this.positions;
  }

  getSkills(): { _id: string; name: string }[] {
    return this.skills;
  }
}

export const demoDataService = new DemoDataService();
