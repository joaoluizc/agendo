export type Shift = {
    approved: null | boolean;
    assigneeNotes: string;
    available: boolean;
    breakDuration: number;
    dtend: string;
    dtstart: string;
    fromIntegration: null | boolean;
    fullDay: boolean;
    id: string;
    location: {
      id: number;
    };
    openEnd: boolean;
    position: {
      name: string;
      color: string;
    };
    slots: number;
    status: string;
    summary: string;
    type: string;
    user: {
      id: number;
    };
    dateRequested?: string;
    rowNumber?: number;
  };

  export type User = {
    active: boolean;
    avatar: string;
    deactivatedAt: null | string;
    email: string;
    hoursCap: number;
    id: number;
    lastname: string;
    legalName: string;
    name: string;
    origin: null | string;
    preferredName: null | string;
    timeclockEnabled: boolean;
    timezone: string;
    type: string;
    shifts: Shift[];
    orgs?: Organization[];
  };

  export type SortedCalendar = {
    [key: string]: Shift[];
  }

  type Organization = {
    businessCategory: string;
    id: number;
    isBusinessSubscription: boolean;
    isPremium: boolean;
    isYearlyPlan: boolean;
    name: string;
    nextChargeDate: string;
    premiumTrialStartDate: string;
    subscriptionCancelDate: null | string;
    subscriptionStartDate: string;
  };