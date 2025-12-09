import { privateProcedure, router } from '../trpc';
import {
  calendar,
  calendarEvent,
  calendarEventAttendee,
  calendarEventReminder,
  calendarAiChat,
} from '../../db/schema';
import { eq, and, gte, lte, desc, asc, or, ilike } from 'drizzle-orm';
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { generateText, tool } from 'ai';
import { openai } from '../../lib/openai';
import { env } from '../../env';
import { format, addDays, addWeeks, startOfDay, endOfDay, startOfWeek, endOfWeek } from 'date-fns';

// Recurrence rule schema
const recurrenceRuleSchema = z.object({
  frequency: z.enum(['daily', 'weekly', 'monthly', 'yearly']),
  interval: z.number().min(1).max(365),
  count: z.number().min(1).max(999).optional(),
  until: z.string().optional(),
  byDay: z.array(z.string()).optional(),
  byMonthDay: z.array(z.number()).optional(),
  byMonth: z.array(z.number()).optional(),
  bySetPos: z.array(z.number()).optional(),
  weekStart: z.string().optional(),
  exceptions: z.array(z.string()).optional(),
});

// Reminder schema
const reminderSchema = z.object({
  minutesBefore: z.number().min(0),
  method: z.enum(['email', 'push', 'popup']),
});

export const calendarRouter = router({
  // Get all calendars for the user
  getCalendars: privateProcedure.query(async ({ ctx }) => {
    const { sessionUser } = ctx;

    const calendars = await ctx.db
      .select()
      .from(calendar)
      .where(eq(calendar.userId, sessionUser.id))
      .orderBy(asc(calendar.name));

    // Create default calendar if none exist
    if (calendars.length === 0) {
      const defaultCalendar = {
        id: crypto.randomUUID(),
        userId: sessionUser.id,
        name: 'My Calendar',
        description: 'Default calendar',
        color: '#3b82f6',
        isDefault: true,
        isVisible: true,
        source: 'local' as const,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await ctx.db.insert(calendar).values(defaultCalendar);

      return { calendars: [defaultCalendar] };
    }

    return { calendars };
  }),

  // Create a new calendar
  createCalendar: privateProcedure
    .input(
      z.object({
        name: z.string().min(1).max(100),
        description: z.string().max(500).optional(),
        color: z.string().default('#3b82f6'),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const { sessionUser } = ctx;

      const newCalendar = {
        id: crypto.randomUUID(),
        userId: sessionUser.id,
        name: input.name,
        description: input.description,
        color: input.color,
        isDefault: false,
        isVisible: true,
        source: 'local' as const,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await ctx.db.insert(calendar).values(newCalendar);

      return { calendar: newCalendar };
    }),

  // Update a calendar
  updateCalendar: privateProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1).max(100).optional(),
        description: z.string().max(500).optional(),
        color: z.string().optional(),
        isVisible: z.boolean().optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const { sessionUser } = ctx;
      const { id, ...updates } = input;

      // Verify ownership
      const existing = await ctx.db
        .select()
        .from(calendar)
        .where(and(eq(calendar.id, id), eq(calendar.userId, sessionUser.id)))
        .limit(1);

      if (existing.length === 0) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Calendar not found' });
      }

      await ctx.db
        .update(calendar)
        .set({ ...updates, updatedAt: new Date() })
        .where(eq(calendar.id, id));

      return { success: true };
    }),

  // Delete a calendar
  deleteCalendar: privateProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const { sessionUser } = ctx;

      // Verify ownership
      const existing = await ctx.db
        .select()
        .from(calendar)
        .where(and(eq(calendar.id, input.id), eq(calendar.userId, sessionUser.id)))
        .limit(1);

      if (existing.length === 0) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Calendar not found' });
      }

      if (existing[0].isDefault) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Cannot delete default calendar' });
      }

      // Delete cascade will handle events, attendees, reminders
      await ctx.db.delete(calendar).where(eq(calendar.id, input.id));

      return { success: true };
    }),

  // Get events for a date range
  getEvents: privateProcedure
    .input(
      z.object({
        startDate: z.string(),
        endDate: z.string(),
        calendarIds: z.array(z.string()).optional(),
      }),
    )
    .query(async ({ input, ctx }) => {
      const { sessionUser } = ctx;
      const startDate = new Date(input.startDate);
      const endDate = new Date(input.endDate);

      // Build query conditions
      const conditions = [
        eq(calendarEvent.userId, sessionUser.id),
        gte(calendarEvent.startTime, startDate),
        lte(calendarEvent.startTime, endDate),
      ];

      if (input.calendarIds && input.calendarIds.length > 0) {
        conditions.push(
          or(...input.calendarIds.map((id) => eq(calendarEvent.calendarId, id)))!,
        );
      }

      const events = await ctx.db
        .select()
        .from(calendarEvent)
        .where(and(...conditions))
        .orderBy(asc(calendarEvent.startTime));

      // Fetch attendees and reminders for all events
      const eventIds = events.map((e) => e.id);

      let attendees: (typeof calendarEventAttendee.$inferSelect)[] = [];
      let reminders: (typeof calendarEventReminder.$inferSelect)[] = [];

      if (eventIds.length > 0) {
        attendees = await ctx.db
          .select()
          .from(calendarEventAttendee)
          .where(or(...eventIds.map((id) => eq(calendarEventAttendee.eventId, id))));

        reminders = await ctx.db
          .select()
          .from(calendarEventReminder)
          .where(or(...eventIds.map((id) => eq(calendarEventReminder.eventId, id))));
      }

      // Combine events with their attendees and reminders
      const eventsWithDetails = events.map((event) => ({
        ...event,
        attendees: attendees.filter((a) => a.eventId === event.id),
        reminders: reminders.filter((r) => r.eventId === event.id),
      }));

      return { events: eventsWithDetails };
    }),

  // Get a single event
  getEvent: privateProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input, ctx }) => {
      const { sessionUser } = ctx;

      const events = await ctx.db
        .select()
        .from(calendarEvent)
        .where(and(eq(calendarEvent.id, input.id), eq(calendarEvent.userId, sessionUser.id)))
        .limit(1);

      if (events.length === 0) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Event not found' });
      }

      const event = events[0];

      // Fetch attendees and reminders
      const attendees = await ctx.db
        .select()
        .from(calendarEventAttendee)
        .where(eq(calendarEventAttendee.eventId, event.id));

      const reminders = await ctx.db
        .select()
        .from(calendarEventReminder)
        .where(eq(calendarEventReminder.eventId, event.id));

      return {
        event: {
          ...event,
          attendees,
          reminders,
        },
      };
    }),

  // Create a new event
  createEvent: privateProcedure
    .input(
      z.object({
        calendarId: z.string(),
        title: z.string().min(1).max(200),
        description: z.string().max(5000).optional(),
        location: z.string().max(500).optional(),
        color: z.string().optional(),
        startTime: z.string(),
        endTime: z.string(),
        timezone: z.string().default('UTC'),
        isAllDay: z.boolean().default(false),
        isRecurring: z.boolean().default(false),
        recurrenceRule: recurrenceRuleSchema.optional(),
        conferenceType: z.enum(['nubo_meet', 'google_meet', 'zoom', 'teams']).optional().nullable(),
        reminders: z.array(reminderSchema).optional(),
        attendees: z.array(z.object({ email: z.string().email(), name: z.string().optional() })).optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const { sessionUser } = ctx;

      // Verify calendar ownership
      const calendars = await ctx.db
        .select()
        .from(calendar)
        .where(and(eq(calendar.id, input.calendarId), eq(calendar.userId, sessionUser.id)))
        .limit(1);

      if (calendars.length === 0) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Calendar not found' });
      }

      const eventId = crypto.randomUUID();
      let conferenceUrl: string | undefined;

      // If Nubo Meet is selected, create a meeting
      if (input.conferenceType === 'nubo_meet') {
        const { livekitMeeting } = await import('../../db/schema');
        const meetingId = crypto.randomUUID();
        const roomName = `meeting-${meetingId}`;
        conferenceUrl = `${env.VITE_PUBLIC_APP_URL}/meet/${meetingId}`;

        // Create meeting record
        await ctx.db.insert(livekitMeeting).values({
          id: meetingId,
          roomName,
          title: input.title,
          description: input.description,
          hostId: sessionUser.id,
          scheduledFor: new Date(input.startTime),
          status: 'scheduled',
          maxParticipants: 50,
          recordingEnabled: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }

      // Create the event
      const newEvent = {
        id: eventId,
        calendarId: input.calendarId,
        userId: sessionUser.id,
        title: input.title,
        description: input.description,
        location: input.location,
        color: input.color,
        startTime: new Date(input.startTime),
        endTime: new Date(input.endTime),
        timezone: input.timezone,
        isAllDay: input.isAllDay,
        isRecurring: input.isRecurring,
        recurrenceRule: input.recurrenceRule,
        isRecurringInstance: false,
        source: 'local' as const,
        status: 'confirmed' as const,
        conferenceType: input.conferenceType,
        conferenceUrl,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await ctx.db.insert(calendarEvent).values(newEvent);

      // Create reminders
      if (input.reminders && input.reminders.length > 0) {
        const reminderValues = input.reminders.map((r) => ({
          id: crypto.randomUUID(),
          eventId,
          minutesBefore: r.minutesBefore,
          method: r.method,
          isSent: false,
          createdAt: new Date(),
        }));

        await ctx.db.insert(calendarEventReminder).values(reminderValues);
      }

      // Create attendees
      if (input.attendees && input.attendees.length > 0) {
        const attendeeValues = input.attendees.map((a) => ({
          id: crypto.randomUUID(),
          eventId,
          email: a.email,
          name: a.name,
          responseStatus: 'needsAction' as const,
          isOrganizer: false,
          isOptional: false,
          createdAt: new Date(),
        }));

        await ctx.db.insert(calendarEventAttendee).values(attendeeValues);
      }

      return { event: newEvent };
    }),

  // Update an event
  updateEvent: privateProcedure
    .input(
      z.object({
        id: z.string(),
        calendarId: z.string().optional(),
        title: z.string().min(1).max(200).optional(),
        description: z.string().max(5000).optional().nullable(),
        location: z.string().max(500).optional().nullable(),
        color: z.string().optional().nullable(),
        startTime: z.string().optional(),
        endTime: z.string().optional(),
        timezone: z.string().optional(),
        isAllDay: z.boolean().optional(),
        isRecurring: z.boolean().optional(),
        recurrenceRule: recurrenceRuleSchema.optional().nullable(),
        conferenceType: z.enum(['nubo_meet', 'google_meet', 'zoom', 'teams']).optional().nullable(),
        status: z.enum(['confirmed', 'tentative', 'cancelled']).optional(),
        reminders: z.array(reminderSchema).optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const { sessionUser } = ctx;
      const { id, reminders, ...updates } = input;

      // Verify ownership
      const existing = await ctx.db
        .select()
        .from(calendarEvent)
        .where(and(eq(calendarEvent.id, id), eq(calendarEvent.userId, sessionUser.id)))
        .limit(1);

      if (existing.length === 0) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Event not found' });
      }

      // Prepare updates
      const updateData: Record<string, any> = { updatedAt: new Date() };

      if (updates.title !== undefined) updateData.title = updates.title;
      if (updates.description !== undefined) updateData.description = updates.description;
      if (updates.location !== undefined) updateData.location = updates.location;
      if (updates.color !== undefined) updateData.color = updates.color;
      if (updates.startTime !== undefined) updateData.startTime = new Date(updates.startTime);
      if (updates.endTime !== undefined) updateData.endTime = new Date(updates.endTime);
      if (updates.timezone !== undefined) updateData.timezone = updates.timezone;
      if (updates.isAllDay !== undefined) updateData.isAllDay = updates.isAllDay;
      if (updates.isRecurring !== undefined) updateData.isRecurring = updates.isRecurring;
      if (updates.recurrenceRule !== undefined) updateData.recurrenceRule = updates.recurrenceRule;
      if (updates.conferenceType !== undefined) updateData.conferenceType = updates.conferenceType;
      if (updates.status !== undefined) updateData.status = updates.status;
      if (updates.calendarId !== undefined) updateData.calendarId = updates.calendarId;

      await ctx.db.update(calendarEvent).set(updateData).where(eq(calendarEvent.id, id));

      // Update reminders if provided
      if (reminders !== undefined) {
        // Delete existing reminders
        await ctx.db.delete(calendarEventReminder).where(eq(calendarEventReminder.eventId, id));

        // Create new reminders
        if (reminders.length > 0) {
          const reminderValues = reminders.map((r) => ({
            id: crypto.randomUUID(),
            eventId: id,
            minutesBefore: r.minutesBefore,
            method: r.method,
            isSent: false,
            createdAt: new Date(),
          }));

          await ctx.db.insert(calendarEventReminder).values(reminderValues);
        }
      }

      return { success: true };
    }),

  // Delete an event
  deleteEvent: privateProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const { sessionUser } = ctx;

      // Verify ownership
      const existing = await ctx.db
        .select()
        .from(calendarEvent)
        .where(and(eq(calendarEvent.id, input.id), eq(calendarEvent.userId, sessionUser.id)))
        .limit(1);

      if (existing.length === 0) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Event not found' });
      }

      // Delete cascade will handle attendees and reminders
      await ctx.db.delete(calendarEvent).where(eq(calendarEvent.id, input.id));

      return { success: true };
    }),

  // Search events
  searchEvents: privateProcedure
    .input(
      z.object({
        query: z.string().min(1),
        limit: z.number().min(1).max(100).default(20),
      }),
    )
    .query(async ({ input, ctx }) => {
      const { sessionUser } = ctx;

      // Search events by title, description, or location
      const events = await ctx.db
        .select()
        .from(calendarEvent)
        .where(
          and(
            eq(calendarEvent.userId, sessionUser.id),
            or(
              // Using ILIKE for case-insensitive search in PostgreSQL
              // Note: This is a simplified search - in production, you might want full-text search
              eq(calendarEvent.title, input.query),
            ),
          ),
        )
        .orderBy(desc(calendarEvent.startTime))
        .limit(input.limit);

      return { events };
    }),

  // AI Chat for calendar
  chat: privateProcedure
    .input(
      z.object({
        message: z.string().min(1),
        conversationId: z.string(),
        history: z.string().optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const { sessionUser } = ctx;
      const db = ctx.db;

      // Save user message to chat history
      await db.insert(calendarAiChat).values({
        id: crypto.randomUUID(),
        userId: sessionUser.id,
        conversationId: input.conversationId,
        role: 'user',
        content: input.message,
        createdAt: new Date(),
      });

      // Get user's default calendar
      const userCalendars = await db
        .select()
        .from(calendar)
        .where(eq(calendar.userId, sessionUser.id))
        .limit(1);

      let defaultCalendarId = userCalendars[0]?.id;

      // Create default calendar if none exists
      if (!defaultCalendarId) {
        defaultCalendarId = crypto.randomUUID();
        await db.insert(calendar).values({
          id: defaultCalendarId,
          userId: sessionUser.id,
          name: 'My Calendar',
          color: '#3b82f6',
          isDefault: true,
          isVisible: true,
          source: 'local',
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }

      // Define calendar tools
      const calendarTools = {
        createEvent: tool({
          description: 'Create a new calendar event. Use this when the user wants to schedule something.',
          parameters: z.object({
            title: z.string().describe('The title/name of the event'),
            description: z.string().optional().describe('Optional description of the event'),
            startTime: z.string().describe('Start date and time in ISO format (e.g., 2024-12-15T14:00:00)'),
            endTime: z.string().describe('End date and time in ISO format (e.g., 2024-12-15T15:00:00)'),
            location: z.string().optional().describe('Optional location of the event'),
            isAllDay: z.boolean().optional().default(false).describe('Whether this is an all-day event'),
          }),
          execute: async ({ title, description, startTime, endTime, location, isAllDay }) => {
            const eventId = crypto.randomUUID();
            const newEvent = {
              id: eventId,
              calendarId: defaultCalendarId!,
              userId: sessionUser.id,
              title,
              description,
              location,
              startTime: new Date(startTime),
              endTime: new Date(endTime),
              timezone: 'UTC',
              isAllDay: isAllDay ?? false,
              isRecurring: false,
              isRecurringInstance: false,
              source: 'local' as const,
              status: 'confirmed' as const,
              createdAt: new Date(),
              updatedAt: new Date(),
            };

            await db.insert(calendarEvent).values(newEvent);

            return {
              success: true,
              eventId,
              message: `Created event "${title}" on ${format(new Date(startTime), 'EEEE, MMMM d, yyyy')} at ${format(new Date(startTime), 'h:mm a')}`,
            };
          },
        }),

        getEventsForDate: tool({
          description: 'Get events for a specific date or date range. Use this to check the schedule.',
          parameters: z.object({
            date: z.string().describe('The date to check in ISO format (e.g., 2024-12-15)'),
            range: z.enum(['day', 'week', 'month']).optional().default('day').describe('The range to check'),
          }),
          execute: async ({ date, range }) => {
            const targetDate = new Date(date);
            let rangeStart: Date;
            let rangeEnd: Date;

            switch (range) {
              case 'week':
                rangeStart = startOfWeek(targetDate);
                rangeEnd = endOfWeek(targetDate);
                break;
              case 'month':
                rangeStart = new Date(targetDate.getFullYear(), targetDate.getMonth(), 1);
                rangeEnd = new Date(targetDate.getFullYear(), targetDate.getMonth() + 1, 0, 23, 59, 59);
                break;
              default:
                rangeStart = startOfDay(targetDate);
                rangeEnd = endOfDay(targetDate);
            }

            const events = await db
              .select()
              .from(calendarEvent)
              .where(
                and(
                  eq(calendarEvent.userId, sessionUser.id),
                  gte(calendarEvent.startTime, rangeStart),
                  lte(calendarEvent.startTime, rangeEnd),
                ),
              )
              .orderBy(asc(calendarEvent.startTime));

            if (events.length === 0) {
              return {
                events: [],
                message: `No events found for ${range === 'day' ? format(targetDate, 'EEEE, MMMM d, yyyy') : `the ${range} of ${format(targetDate, 'MMMM d, yyyy')}`}`,
              };
            }

            const eventList = events.map((e) => ({
              id: e.id,
              title: e.title,
              startTime: e.startTime,
              endTime: e.endTime,
              location: e.location,
              isAllDay: e.isAllDay,
            }));

            return {
              events: eventList,
              message: `Found ${events.length} event(s) for ${range === 'day' ? format(targetDate, 'EEEE, MMMM d, yyyy') : `the ${range}`}`,
            };
          },
        }),

        getTodaySchedule: tool({
          description: "Get today's schedule. Use this when user asks about today's events.",
          parameters: z.object({}),
          execute: async () => {
            const today = new Date();
            const dayStart = startOfDay(today);
            const dayEnd = endOfDay(today);

            const events = await db
              .select()
              .from(calendarEvent)
              .where(
                and(
                  eq(calendarEvent.userId, sessionUser.id),
                  gte(calendarEvent.startTime, dayStart),
                  lte(calendarEvent.startTime, dayEnd),
                ),
              )
              .orderBy(asc(calendarEvent.startTime));

            if (events.length === 0) {
              return {
                events: [],
                message: "You have no events scheduled for today. Your day is free!",
              };
            }

            const eventList = events.map((e) => ({
              id: e.id,
              title: e.title,
              startTime: format(e.startTime, 'h:mm a'),
              endTime: format(e.endTime, 'h:mm a'),
              location: e.location,
              isAllDay: e.isAllDay,
            }));

            return {
              events: eventList,
              message: `You have ${events.length} event(s) scheduled for today`,
            };
          },
        }),

        getUpcomingEvents: tool({
          description: 'Get upcoming events for the next few days.',
          parameters: z.object({
            days: z.number().optional().default(7).describe('Number of days to look ahead'),
          }),
          execute: async ({ days }) => {
            const now = new Date();
            const futureDate = addDays(now, days);

            const events = await db
              .select()
              .from(calendarEvent)
              .where(
                and(
                  eq(calendarEvent.userId, sessionUser.id),
                  gte(calendarEvent.startTime, now),
                  lte(calendarEvent.startTime, futureDate),
                ),
              )
              .orderBy(asc(calendarEvent.startTime))
              .limit(20);

            if (events.length === 0) {
              return {
                events: [],
                message: `No upcoming events in the next ${days} days`,
              };
            }

            const eventList = events.map((e) => ({
              id: e.id,
              title: e.title,
              date: format(e.startTime, 'EEEE, MMM d'),
              startTime: format(e.startTime, 'h:mm a'),
              endTime: format(e.endTime, 'h:mm a'),
              location: e.location,
            }));

            return {
              events: eventList,
              message: `Found ${events.length} upcoming event(s) in the next ${days} days`,
            };
          },
        }),

        deleteEvent: tool({
          description: 'Delete a calendar event by its ID or by searching for it by title.',
          parameters: z.object({
            eventId: z.string().optional().describe('The ID of the event to delete'),
            title: z.string().optional().describe('The title of the event to delete (will find the most recent match)'),
          }),
          execute: async ({ eventId, title }) => {
            let targetEventId = eventId;

            if (!targetEventId && title) {
              // Find event by title
              const events = await db
                .select()
                .from(calendarEvent)
                .where(
                  and(
                    eq(calendarEvent.userId, sessionUser.id),
                    ilike(calendarEvent.title, `%${title}%`),
                  ),
                )
                .orderBy(desc(calendarEvent.startTime))
                .limit(1);

              if (events.length === 0) {
                return {
                  success: false,
                  message: `No event found with title containing "${title}"`,
                };
              }
              targetEventId = events[0].id;
            }

            if (!targetEventId) {
              return {
                success: false,
                message: 'Please provide either an event ID or title to delete',
              };
            }

            // Verify ownership and get event details
            const existing = await db
              .select()
              .from(calendarEvent)
              .where(and(eq(calendarEvent.id, targetEventId), eq(calendarEvent.userId, sessionUser.id)))
              .limit(1);

            if (existing.length === 0) {
              return {
                success: false,
                message: 'Event not found or you do not have permission to delete it',
              };
            }

            await db.delete(calendarEvent).where(eq(calendarEvent.id, targetEventId));

            return {
              success: true,
              message: `Deleted event "${existing[0].title}"`,
            };
          },
        }),

        updateEvent: tool({
          description: 'Update an existing calendar event.',
          parameters: z.object({
            eventId: z.string().optional().describe('The ID of the event to update'),
            title: z.string().optional().describe('Search for event by title (if no eventId provided)'),
            newTitle: z.string().optional().describe('New title for the event'),
            newDescription: z.string().optional().describe('New description'),
            newStartTime: z.string().optional().describe('New start time in ISO format'),
            newEndTime: z.string().optional().describe('New end time in ISO format'),
            newLocation: z.string().optional().describe('New location'),
          }),
          execute: async ({ eventId, title, newTitle, newDescription, newStartTime, newEndTime, newLocation }) => {
            let targetEventId = eventId;

            if (!targetEventId && title) {
              const events = await db
                .select()
                .from(calendarEvent)
                .where(
                  and(
                    eq(calendarEvent.userId, sessionUser.id),
                    ilike(calendarEvent.title, `%${title}%`),
                  ),
                )
                .orderBy(desc(calendarEvent.startTime))
                .limit(1);

              if (events.length === 0) {
                return {
                  success: false,
                  message: `No event found with title containing "${title}"`,
                };
              }
              targetEventId = events[0].id;
            }

            if (!targetEventId) {
              return {
                success: false,
                message: 'Please provide either an event ID or title to update',
              };
            }

            const existing = await db
              .select()
              .from(calendarEvent)
              .where(and(eq(calendarEvent.id, targetEventId), eq(calendarEvent.userId, sessionUser.id)))
              .limit(1);

            if (existing.length === 0) {
              return {
                success: false,
                message: 'Event not found',
              };
            }

            const updates: Record<string, any> = { updatedAt: new Date() };
            if (newTitle) updates.title = newTitle;
            if (newDescription !== undefined) updates.description = newDescription;
            if (newStartTime) updates.startTime = new Date(newStartTime);
            if (newEndTime) updates.endTime = new Date(newEndTime);
            if (newLocation !== undefined) updates.location = newLocation;

            await db.update(calendarEvent).set(updates).where(eq(calendarEvent.id, targetEventId));

            return {
              success: true,
              message: `Updated event "${existing[0].title}"`,
            };
          },
        }),

        findFreeTime: tool({
          description: 'Find free time slots on a given day.',
          parameters: z.object({
            date: z.string().describe('The date to check for free time in ISO format'),
            duration: z.number().optional().default(60).describe('Desired duration in minutes'),
          }),
          execute: async ({ date, duration }) => {
            const targetDate = new Date(date);
            const dayStart = new Date(targetDate);
            dayStart.setHours(9, 0, 0, 0); // Start at 9 AM
            const dayEnd = new Date(targetDate);
            dayEnd.setHours(18, 0, 0, 0); // End at 6 PM

            const events = await db
              .select()
              .from(calendarEvent)
              .where(
                and(
                  eq(calendarEvent.userId, sessionUser.id),
                  gte(calendarEvent.startTime, dayStart),
                  lte(calendarEvent.endTime, dayEnd),
                ),
              )
              .orderBy(asc(calendarEvent.startTime));

            // Find gaps between events
            const freeSlots: { start: Date; end: Date }[] = [];
            let currentTime = dayStart;

            for (const event of events) {
              if (event.startTime > currentTime) {
                const gapMinutes = (event.startTime.getTime() - currentTime.getTime()) / 60000;
                if (gapMinutes >= duration) {
                  freeSlots.push({
                    start: new Date(currentTime),
                    end: new Date(event.startTime),
                  });
                }
              }
              if (event.endTime > currentTime) {
                currentTime = new Date(event.endTime);
              }
            }

            // Check remaining time after last event
            if (currentTime < dayEnd) {
              const gapMinutes = (dayEnd.getTime() - currentTime.getTime()) / 60000;
              if (gapMinutes >= duration) {
                freeSlots.push({
                  start: new Date(currentTime),
                  end: dayEnd,
                });
              }
            }

            if (freeSlots.length === 0) {
              return {
                freeSlots: [],
                message: `No free slots of ${duration} minutes found on ${format(targetDate, 'EEEE, MMMM d')}`,
              };
            }

            const formattedSlots = freeSlots.map((slot) => ({
              start: format(slot.start, 'h:mm a'),
              end: format(slot.end, 'h:mm a'),
              duration: Math.round((slot.end.getTime() - slot.start.getTime()) / 60000),
            }));

            return {
              freeSlots: formattedSlots,
              message: `Found ${freeSlots.length} free slot(s) on ${format(targetDate, 'EEEE, MMMM d')}`,
            };
          },
        }),
      };

      // Build system prompt
      const systemPrompt = `You are a helpful calendar assistant for Nubo Calendar. You help users manage their schedule by:
- Creating new events
- Checking their schedule for specific dates
- Finding free time slots
- Updating or deleting events
- Answering questions about their upcoming events

Current date and time: ${format(new Date(), 'EEEE, MMMM d, yyyy h:mm a')}

When users ask to schedule something:
- Always confirm the event details after creating
- Use reasonable defaults for duration (1 hour) if not specified
- Parse natural language dates like "tomorrow", "next Monday", "in 2 hours"

When responding:
- Be concise and helpful
- Format dates and times in a readable way
- If an action was successful, confirm what was done
- If something failed, explain why and suggest alternatives

Important: When parsing relative dates:
- "today" = ${format(new Date(), 'yyyy-MM-dd')}
- "tomorrow" = ${format(addDays(new Date(), 1), 'yyyy-MM-dd')}
- "next week" = ${format(addWeeks(new Date(), 1), 'yyyy-MM-dd')}`;

      // Build conversation messages
      const messages: { role: 'user' | 'assistant' | 'system'; content: string }[] = [
        { role: 'system', content: systemPrompt },
      ];

      // Add history if provided
      if (input.history) {
        messages.push({
          role: 'user',
          content: `Previous conversation context:\n${input.history}\n\nCurrent message:`,
        });
      }

      messages.push({ role: 'user', content: input.message });

      let response: string;
      let usedTools = false;

      try {
        const result = await generateText({
          model: openai(env.OPENAI_MODEL || 'gpt-4o'),
          messages,
          tools: calendarTools,
          maxSteps: 5,
          maxTokens: 1000,
          temperature: 0.7,
        });

        response = result.text;
        usedTools = result.steps.some((step) => step.toolCalls && step.toolCalls.length > 0);

        // Store tool calls if any
        const toolCalls = result.steps
          .flatMap((step) => {
            const toolResults = step.toolResults || [];
            return (step.toolCalls || []).map((tc, i) => ({
              name: tc.toolName,
              arguments: tc.args as Record<string, unknown>,
              result: toolResults[i]?.result,
            }));
          });

        // Save assistant response with tool calls
        await db.insert(calendarAiChat).values({
          id: crypto.randomUUID(),
          userId: sessionUser.id,
          conversationId: input.conversationId,
          role: 'assistant',
          content: response,
          toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
          createdAt: new Date(),
        });
      } catch (error) {
        console.error('Calendar AI chat error:', error);
        response = "I'm sorry, I encountered an error processing your request. Please try again.";

        await db.insert(calendarAiChat).values({
          id: crypto.randomUUID(),
          userId: sessionUser.id,
          conversationId: input.conversationId,
          role: 'assistant',
          content: response,
          createdAt: new Date(),
        });
      }

      return { response, usedTools };
    }),

  // Get today's events
  getTodayEvents: privateProcedure.query(async ({ ctx }) => {
    const { sessionUser } = ctx;

    const today = new Date();
    const startOfDay = new Date(today);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(today);
    endOfDay.setHours(23, 59, 59, 999);

    const events = await ctx.db
      .select()
      .from(calendarEvent)
      .where(
        and(
          eq(calendarEvent.userId, sessionUser.id),
          gte(calendarEvent.startTime, startOfDay),
          lte(calendarEvent.startTime, endOfDay),
        ),
      )
      .orderBy(asc(calendarEvent.startTime));

    return { events };
  }),

  // Get upcoming events
  getUpcomingEvents: privateProcedure
    .input(z.object({ limit: z.number().min(1).max(50).default(10) }))
    .query(async ({ ctx, input }) => {
      const { sessionUser } = ctx;

      const now = new Date();

      const events = await ctx.db
        .select()
        .from(calendarEvent)
        .where(and(eq(calendarEvent.userId, sessionUser.id), gte(calendarEvent.startTime, now)))
        .orderBy(asc(calendarEvent.startTime))
        .limit(input.limit);

      return { events };
    }),
});
