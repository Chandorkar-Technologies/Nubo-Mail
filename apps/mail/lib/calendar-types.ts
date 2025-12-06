// Calendar Types for Nubo Calendar

export type RecurrenceRule = {
  frequency: 'daily' | 'weekly' | 'monthly' | 'yearly';
  interval: number;
  count?: number;
  until?: string;
  byDay?: string[];
  byMonthDay?: number[];
  byMonth?: number[];
  bySetPos?: number[];
  weekStart?: string;
  exceptions?: string[];
};

export type CalendarEvent = {
  id: string;
  calendarId: string;
  userId: string;
  title: string;
  description?: string | null;
  location?: string | null;
  color?: string | null;
  startTime: Date;
  endTime: Date;
  timezone: string | null;
  isAllDay: boolean | null;
  isRecurring: boolean | null;
  recurrenceRule?: RecurrenceRule | unknown | null;
  isRecurringInstance: boolean | null;
  originalEventId?: string | null;
  originalStartTime?: Date | null;
  recurrenceStatus?: 'confirmed' | 'cancelled' | 'modified' | null;
  source: 'local' | 'google' | 'microsoft' | null;
  sourceEventId?: string | null;
  status: 'confirmed' | 'tentative' | 'cancelled' | null;
  conferenceUrl?: string | null;
  conferenceType?: 'nubo_meet' | 'google_meet' | 'zoom' | 'teams' | null;
  createdAt: Date;
  updatedAt: Date;
  attendees?: CalendarEventAttendee[];
  reminders?: CalendarEventReminder[];
};

export type CalendarEventAttendee = {
  id: string;
  eventId: string;
  email: string;
  name?: string | null;
  responseStatus: 'needsAction' | 'accepted' | 'declined' | 'tentative' | null;
  isOrganizer: boolean | null;
  isOptional: boolean | null;
  userId?: string | null;
  respondedAt?: Date | null;
  createdAt: Date;
};

export type CalendarEventReminder = {
  id: string;
  eventId: string;
  minutesBefore: number;
  method: 'email' | 'push' | 'popup' | null;
  isSent: boolean | null;
  sentAt?: Date | null;
  createdAt: Date;
};

export type Calendar = {
  id: string;
  userId: string;
  name: string;
  description?: string | null;
  color: string;
  isDefault: boolean | null;
  isVisible: boolean | null;
  source: 'local' | 'google' | 'microsoft' | null;
  sourceCalendarId?: string | null;
  syncToken?: string | null;
  lastSyncedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type CalendarShare = {
  id: string;
  calendarId: string;
  sharedWithUserId?: string | null;
  sharedWithEmail?: string | null;
  accessLevel: 'freeBusy' | 'read' | 'write' | 'admin';
  status: 'pending' | 'accepted' | 'declined';
  createdAt: Date;
  updatedAt: Date;
};

export type CalendarViewType = 'day' | 'week' | 'month' | 'year' | 'agenda';

export type EventFormData = {
  title: string;
  description?: string;
  startTime: string;
  endTime: string;
  location?: string;
  color?: string;
  timezone: string;
  isAllDay: boolean;
  calendarId: string;
  isRecurring: boolean;
  recurrenceFrequency?: 'daily' | 'weekly' | 'monthly' | 'yearly';
  recurrenceInterval?: number;
  recurrenceEndType?: 'never' | 'after' | 'on';
  recurrenceEndAfter?: number;
  recurrenceEndOn?: string;
  recurrenceByDay?: string[];
  reminders?: { minutesBefore: number; method: 'email' | 'push' | 'popup' }[];
  attendees?: { email: string; name?: string }[];
  conferenceType?: 'nubo_meet' | 'google_meet' | 'zoom' | 'teams';
};

// Calendar color options
export const CALENDAR_COLORS = [
  { name: 'Blue', value: '#3b82f6' },
  { name: 'Green', value: '#10b981' },
  { name: 'Red', value: '#ef4444' },
  { name: 'Yellow', value: '#f59e0b' },
  { name: 'Purple', value: '#8b5cf6' },
  { name: 'Pink', value: '#ec4899' },
  { name: 'Cyan', value: '#06b6d4' },
  { name: 'Teal', value: '#14b8a6' },
  { name: 'Orange', value: '#f97316' },
  { name: 'Indigo', value: '#6366f1' },
];

// Default reminder options (in minutes)
export const REMINDER_OPTIONS = [
  { label: 'At time of event', value: 0 },
  { label: '5 minutes before', value: 5 },
  { label: '10 minutes before', value: 10 },
  { label: '15 minutes before', value: 15 },
  { label: '30 minutes before', value: 30 },
  { label: '1 hour before', value: 60 },
  { label: '2 hours before', value: 120 },
  { label: '1 day before', value: 1440 },
  { label: '2 days before', value: 2880 },
  { label: '1 week before', value: 10080 },
];

// Day of week options for recurrence
export const DAYS_OF_WEEK = [
  { label: 'Sunday', value: 'SU', short: 'S' },
  { label: 'Monday', value: 'MO', short: 'M' },
  { label: 'Tuesday', value: 'TU', short: 'T' },
  { label: 'Wednesday', value: 'WE', short: 'W' },
  { label: 'Thursday', value: 'TH', short: 'T' },
  { label: 'Friday', value: 'FR', short: 'F' },
  { label: 'Saturday', value: 'SA', short: 'S' },
];
