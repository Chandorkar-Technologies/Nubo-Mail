import {
  format,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  startOfYear,
  endOfYear,
  eachDayOfInterval,
  eachMonthOfInterval,
  isSameDay,
  isSameMonth,
  isWithinInterval,
  addDays,
  subDays,
  addMonths,
  subMonths,
  addYears,
  subYears,
  getDay,
  setHours,
  setMinutes,
  setSeconds,
  setMilliseconds,
} from 'date-fns';
import type { CalendarEvent, CalendarViewType } from './calendar-types';

// Get date range based on view type
export function getDateRange(
  currentDate: Date,
  view: CalendarViewType,
  agendaRange?: 'day' | 'week' | 'month',
): { start: Date; end: Date } {
  switch (view) {
    case 'month': {
      const monthStart = startOfMonth(currentDate);
      const monthEnd = endOfMonth(currentDate);
      const firstDayOfWeek = getDay(monthStart);
      const lastDayOfWeek = getDay(monthEnd);
      return {
        start: subDays(monthStart, firstDayOfWeek),
        end: addDays(monthEnd, 6 - lastDayOfWeek),
      };
    }
    case 'week':
      return {
        start: startOfWeek(currentDate),
        end: endOfWeek(currentDate),
      };
    case 'year':
      return {
        start: startOfYear(currentDate),
        end: endOfYear(currentDate),
      };
    case 'agenda': {
      if (agendaRange === 'day') {
        return {
          start: setMilliseconds(setSeconds(setMinutes(setHours(currentDate, 0), 0), 0), 0),
          end: setMilliseconds(setSeconds(setMinutes(setHours(currentDate, 23), 59), 59), 999),
        };
      } else if (agendaRange === 'month') {
        return {
          start: startOfMonth(currentDate),
          end: endOfMonth(currentDate),
        };
      }
      return {
        start: startOfWeek(currentDate),
        end: endOfWeek(currentDate),
      };
    }
    case 'day':
    default: {
      const dayStart = new Date(currentDate);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(currentDate);
      dayEnd.setHours(23, 59, 59, 999);
      return { start: dayStart, end: dayEnd };
    }
  }
}

// Get view title based on current date and view type
export function getViewTitle(
  currentDate: Date,
  view: CalendarViewType,
  agendaRange?: 'day' | 'week' | 'month',
): string {
  switch (view) {
    case 'month':
      return format(currentDate, 'MMMM yyyy');
    case 'week': {
      const weekStart = startOfWeek(currentDate);
      const weekEnd = endOfWeek(currentDate);
      if (weekStart.getMonth() === weekEnd.getMonth()) {
        return `${format(weekStart, 'MMM d')} - ${format(weekEnd, 'd, yyyy')}`;
      } else if (weekStart.getFullYear() === weekEnd.getFullYear()) {
        return `${format(weekStart, 'MMM d')} - ${format(weekEnd, 'MMM d, yyyy')}`;
      }
      return `${format(weekStart, 'MMM d, yyyy')} - ${format(weekEnd, 'MMM d, yyyy')}`;
    }
    case 'year':
      return format(currentDate, 'yyyy');
    case 'agenda': {
      if (agendaRange === 'day') {
        return format(currentDate, 'EEEE, MMMM d, yyyy');
      } else if (agendaRange === 'month') {
        return format(currentDate, 'MMMM yyyy');
      }
      const weekStart = startOfWeek(currentDate);
      const weekEnd = endOfWeek(currentDate);
      return `${format(weekStart, 'MMM d')} - ${format(weekEnd, 'MMM d, yyyy')}`;
    }
    case 'day':
    default:
      return format(currentDate, 'EEEE, MMMM d, yyyy');
  }
}

// Navigate to previous period
export function navigatePrevious(currentDate: Date, view: CalendarViewType): Date {
  switch (view) {
    case 'month':
      return subMonths(currentDate, 1);
    case 'week':
      return subDays(currentDate, 7);
    case 'year':
      return subYears(currentDate, 1);
    case 'day':
    case 'agenda':
    default:
      return subDays(currentDate, 1);
  }
}

// Navigate to next period
export function navigateNext(currentDate: Date, view: CalendarViewType): Date {
  switch (view) {
    case 'month':
      return addMonths(currentDate, 1);
    case 'week':
      return addDays(currentDate, 7);
    case 'year':
      return addYears(currentDate, 1);
    case 'day':
    case 'agenda':
    default:
      return addDays(currentDate, 1);
  }
}

// Get days for month view (including padding days from previous/next months)
export function getDaysInMonth(
  currentDate: Date,
  events: CalendarEvent[],
): { date: Date; isCurrentMonth: boolean; events: CalendarEvent[] }[] {
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const startingDayOfWeek = firstDay.getDay();
  const calendarStart = subDays(firstDay, startingDayOfWeek);
  const calendarEnd = addDays(calendarStart, 41); // 6 weeks

  return eachDayOfInterval({ start: calendarStart, end: calendarEnd }).map((date) => {
    const dayEvents = events.filter((event) => {
      if (!event.startTime) return false;
      return isSameDay(new Date(event.startTime), date);
    });

    return {
      date,
      isCurrentMonth: isSameMonth(date, currentDate),
      events: dayEvents,
    };
  });
}

// Get days for week view
export function getDaysInWeek(
  currentDate: Date,
  events: CalendarEvent[],
): { date: Date; events: CalendarEvent[] }[] {
  const weekStart = startOfWeek(currentDate);
  const weekEnd = endOfWeek(currentDate);

  return eachDayOfInterval({ start: weekStart, end: weekEnd }).map((date) => {
    const dayEvents = events.filter((event) => {
      if (!event.startTime) return false;
      return isSameDay(new Date(event.startTime), date);
    });

    return { date, events: dayEvents };
  });
}

// Get events for a specific day
export function getEventsForDay(currentDate: Date, events: CalendarEvent[]): CalendarEvent[] {
  return events.filter((event) => {
    if (!event.startTime) return false;
    return isSameDay(new Date(event.startTime), currentDate);
  });
}

// Get months for year view
export function getMonthsInYear(
  currentDate: Date,
  events: CalendarEvent[],
): {
  month: Date;
  events: CalendarEvent[];
  days: { date: Date; isCurrentMonth: boolean; events: CalendarEvent[] }[];
}[] {
  const yearStart = startOfYear(currentDate);
  const yearEnd = endOfYear(currentDate);

  return eachMonthOfInterval({ start: yearStart, end: yearEnd }).map((month) => {
    const monthStart = startOfMonth(month);
    const monthEnd = endOfMonth(month);

    const monthEvents = events.filter((event) => {
      if (!event.startTime) return false;
      const eventStart = new Date(event.startTime);
      return isWithinInterval(eventStart, { start: monthStart, end: monthEnd });
    });

    // Get days for mini calendar
    const firstDayOfMonth = getDay(monthStart);
    const calendarStart = subDays(monthStart, firstDayOfMonth);
    const calendarEnd = addDays(calendarStart, 34); // 5 weeks

    const days = eachDayOfInterval({ start: calendarStart, end: calendarEnd }).map((date) => {
      const dayEvents = events.filter((event) => {
        if (!event.startTime) return false;
        return isSameDay(new Date(event.startTime), date);
      });

      return {
        date,
        isCurrentMonth: isSameMonth(date, month),
        events: dayEvents,
      };
    });

    return { month, events: monthEvents, days };
  });
}

// Get events grouped by date for agenda view
export function getEventsForAgenda(
  currentDate: Date,
  events: CalendarEvent[],
  range: 'day' | 'week' | 'month',
): {
  startDate: Date;
  endDate: Date;
  eventsByDate: Record<string, CalendarEvent[]>;
} {
  const { start: startDate, end: endDate } = getDateRange(currentDate, 'agenda', range);

  const rangeEvents = events.filter((event) => {
    if (!event.startTime) return false;
    const eventStart = new Date(event.startTime);
    return isWithinInterval(eventStart, { start: startDate, end: endDate });
  });

  const eventsByDate: Record<string, CalendarEvent[]> = {};

  rangeEvents.forEach((event) => {
    const eventDate = new Date(event.startTime);
    const dateKey = format(eventDate, 'yyyy-MM-dd');

    if (!eventsByDate[dateKey]) {
      eventsByDate[dateKey] = [];
    }
    eventsByDate[dateKey].push(event);
  });

  // Sort events within each day
  Object.keys(eventsByDate).forEach((dateKey) => {
    eventsByDate[dateKey].sort((a, b) => {
      return new Date(a.startTime).getTime() - new Date(b.startTime).getTime();
    });
  });

  return { startDate, endDate, eventsByDate };
}

// Calculate event position for day/week view
export function getEventPosition(event: CalendarEvent): { top: number; height: number } {
  const startDate = new Date(event.startTime);
  const endDate = new Date(event.endTime);

  const startHour = startDate.getHours() + startDate.getMinutes() / 60;
  const endHour = endDate.getHours() + endDate.getMinutes() / 60;
  const duration = endHour - startHour;

  // Each hour is 48px (12px * 4)
  const top = startHour * 48;
  const height = Math.max(duration * 48, 20); // Minimum height of 20px

  return { top, height };
}

// Format time for display
export function formatEventTime(date: Date, isAllDay: boolean | null): string {
  if (isAllDay) return 'All day';
  return format(date, 'h:mm a');
}

// Format date for input fields
export function formatDateTimeForInput(date: Date | string, isAllDay: boolean | null): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isAllDay) {
    return format(d, 'yyyy-MM-dd');
  }
  return format(d, "yyyy-MM-dd'T'HH:mm");
}

// Check if two events overlap
export function eventsOverlap(event1: CalendarEvent, event2: CalendarEvent): boolean {
  const start1 = new Date(event1.startTime).getTime();
  const end1 = new Date(event1.endTime).getTime();
  const start2 = new Date(event2.startTime).getTime();
  const end2 = new Date(event2.endTime).getTime();

  return start1 < end2 && end1 > start2;
}

// Get current time position for time indicator
export function getCurrentTimePosition(): number {
  const now = new Date();
  return (now.getHours() + now.getMinutes() / 60) * 48;
}

// Generate unique ID
export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}
