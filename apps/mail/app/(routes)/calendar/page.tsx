import { useState, useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Checkbox } from '@/components/ui/checkbox';
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Search,
  Layers,
  Calendar as CalendarIcon,
  Clock,
  CalendarDays,
  Grid3X3,
  List,
  X,
  Zap,
  Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTRPC } from '@/providers/query-provider';
import { format, isSameDay } from 'date-fns';
import type { CalendarEvent, CalendarViewType } from '@/lib/calendar-types';
import {
  getDateRange,
  getViewTitle,
  navigatePrevious,
  navigateNext,
  getDaysInMonth,
  getDaysInWeek,
  getEventsForDay,
  getMonthsInYear,
  getEventsForAgenda,
  getEventPosition,
  formatEventTime,
  getCurrentTimePosition,
} from '@/lib/calendar-utils';
import { EventDialog } from '@/components/calendar/event-dialog';
import { CalendarChatPanel } from '@/components/calendar/chat-panel';

export default function NuboCalendarPage() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  // State
  const [currentDate, setCurrentDate] = useState(new Date());
  const [view, setView] = useState<CalendarViewType>('month');
  const [agendaRange, setAgendaRange] = useState<'day' | 'week' | 'month'>('week');
  const [searchQuery, setSearchQuery] = useState('');
  const [showCalendarDrawer, setShowCalendarDrawer] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [showEventDialog, setShowEventDialog] = useState(false);
  const [showChatPanel, setShowChatPanel] = useState(false);
  const [visibleCalendars, setVisibleCalendars] = useState<Record<string, boolean>>({});

  // Get date range for current view
  const { start: rangeStart, end: rangeEnd } = useMemo(
    () => getDateRange(currentDate, view, agendaRange),
    [currentDate, view, agendaRange],
  );

  // Fetch calendars
  const { data: calendarsData, isLoading: isLoadingCalendars } = useQuery(
    trpc.calendar.getCalendars.queryOptions(void 0, {
      staleTime: 5 * 60 * 1000,
    }),
  );

  const calendars = calendarsData?.calendars ?? [];

  // Initialize visible calendars when data loads
  useMemo(() => {
    if (calendars.length > 0 && Object.keys(visibleCalendars).length === 0) {
      const initial: Record<string, boolean> = {};
      calendars.forEach((cal) => {
        initial[cal.id] = cal.isVisible ?? true;
      });
      setVisibleCalendars(initial);
    }
  }, [calendars, visibleCalendars]);

  // Fetch events
  const { data: eventsData, isLoading: isLoadingEvents } = useQuery(
    trpc.calendar.getEvents.queryOptions(
      {
        startDate: rangeStart.toISOString(),
        endDate: rangeEnd.toISOString(),
      },
      {
        staleTime: 1 * 60 * 1000,
      },
    ),
  );

  const events = eventsData?.events ?? [];

  // Filter events by visible calendars and search query
  const filteredEvents = useMemo(() => {
    let filtered = events.filter((event) => visibleCalendars[event.calendarId] !== false);

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (event) =>
          event.title.toLowerCase().includes(query) ||
          event.description?.toLowerCase().includes(query) ||
          event.location?.toLowerCase().includes(query),
      );
    }

    return filtered;
  }, [events, visibleCalendars, searchQuery]);

  // View title
  const viewTitle = useMemo(
    () => getViewTitle(currentDate, view, agendaRange),
    [currentDate, view, agendaRange],
  );

  // Navigation handlers
  const handlePrevious = useCallback(() => {
    setCurrentDate((prev) => navigatePrevious(prev, view));
  }, [view]);

  const handleNext = useCallback(() => {
    setCurrentDate((prev) => navigateNext(prev, view));
  }, [view]);

  const handleToday = useCallback(() => {
    setCurrentDate(new Date());
  }, []);

  // Event handlers
  const handleEventClick = useCallback((event: CalendarEvent) => {
    setSelectedEvent(event);
    setShowEventDialog(true);
  }, []);

  const handleCreateEvent = useCallback(() => {
    setSelectedEvent(null);
    setShowEventDialog(true);
  }, []);

  const toggleCalendarVisibility = useCallback((calendarId: string) => {
    setVisibleCalendars((prev) => ({
      ...prev,
      [calendarId]: !prev[calendarId],
    }));
  }, []);

  // Get event color based on calendar
  const getEventColor = useCallback(
    (event: CalendarEvent) => {
      if (event.color) return event.color;
      const calendar = calendars.find((c) => c.id === event.calendarId);
      return calendar?.color ?? '#3b82f6';
    },
    [calendars],
  );

  // Loading state
  if (isLoadingCalendars || isLoadingEvents) {
    return (
      <div className="flex h-full w-full flex-col bg-background">
        <div className="flex flex-1 items-center justify-center">
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-muted-foreground">Loading calendar...</p>
          </div>
        </div>
      </div>
    );
  }

  // Month view data
  const daysInMonth = view === 'month' ? getDaysInMonth(currentDate, filteredEvents) : [];

  // Week view data
  const daysInWeek = view === 'week' ? getDaysInWeek(currentDate, filteredEvents) : [];

  // Day view data
  const eventsForDay = view === 'day' ? getEventsForDay(currentDate, filteredEvents) : [];

  // Year view data
  const monthsInYear = view === 'year' ? getMonthsInYear(currentDate, filteredEvents) : [];

  // Agenda view data
  const agendaData =
    view === 'agenda' ? getEventsForAgenda(currentDate, filteredEvents, agendaRange) : null;

  return (
    <div className="flex h-full w-full flex-col bg-background p-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <h2 className="text-3xl font-bold tracking-tight">{viewTitle}</h2>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" onClick={handlePrevious} className="h-9 w-9">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={handleNext} className="h-9 w-9">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          <Button variant="outline" size="sm" onClick={handleToday}>
            Today
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Search */}
          <div className="relative w-56">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search events..."
              className="h-9 pl-9"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          {/* View selector */}
          <Tabs
            value={view}
            onValueChange={(v) => setView(v as CalendarViewType)}
            className="hidden sm:block"
          >
            <TabsList className="h-9">
              <TabsTrigger value="day" className="px-3">
                <Clock className="mr-1 h-4 w-4" />
                Day
              </TabsTrigger>
              <TabsTrigger value="week" className="px-3">
                <CalendarIcon className="mr-1 h-4 w-4" />
                Week
              </TabsTrigger>
              <TabsTrigger value="month" className="px-3">
                <CalendarDays className="mr-1 h-4 w-4" />
                Month
              </TabsTrigger>
              <TabsTrigger value="year" className="px-3">
                <Grid3X3 className="mr-1 h-4 w-4" />
                Year
              </TabsTrigger>
              <TabsTrigger value="agenda" className="px-3">
                <List className="mr-1 h-4 w-4" />
                Agenda
              </TabsTrigger>
            </TabsList>
          </Tabs>

          {/* Agenda range selector */}
          {view === 'agenda' && (
            <Tabs
              value={agendaRange}
              onValueChange={(v) => setAgendaRange(v as 'day' | 'week' | 'month')}
            >
              <TabsList className="h-9">
                <TabsTrigger value="day" className="px-3">
                  Day
                </TabsTrigger>
                <TabsTrigger value="week" className="px-3">
                  Week
                </TabsTrigger>
                <TabsTrigger value="month" className="px-3">
                  Month
                </TabsTrigger>
              </TabsList>
            </Tabs>
          )}

          {/* Calendar toggle */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className={cn('h-9 w-9', showCalendarDrawer && 'bg-muted')}
                  onClick={() => setShowCalendarDrawer(!showCalendarDrawer)}
                >
                  <Layers className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Toggle calendars</TooltipContent>
            </Tooltip>
          </TooltipProvider>

          {/* Create event */}
          <Button size="sm" onClick={handleCreateEvent}>
            <Plus className="mr-1 h-4 w-4" />
            Event
          </Button>

          {/* AI button */}
          <Button variant="ghost" size="sm" onClick={() => setShowChatPanel(true)}>
            <Zap className="mr-1 h-4 w-4" />
            AI
          </Button>
        </div>
      </div>

      {/* Main content */}
      <div className="mt-6 flex flex-1 gap-4">
        {/* Calendar filter drawer */}
        {showCalendarDrawer && (
          <Card className="h-fit w-64 flex-shrink-0 p-4">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-medium">Calendars</h3>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={() => setShowCalendarDrawer(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="space-y-2">
              {calendars.map((calendar) => (
                <div key={calendar.id} className="flex items-center space-x-2">
                  <Checkbox
                    id={`calendar-${calendar.id}`}
                    checked={visibleCalendars[calendar.id] !== false}
                    onCheckedChange={() => toggleCalendarVisibility(calendar.id)}
                  />
                  <label
                    htmlFor={`calendar-${calendar.id}`}
                    className="flex items-center gap-2 text-sm font-medium"
                  >
                    <span
                      className="h-3 w-3 rounded-full"
                      style={{ backgroundColor: calendar.color }}
                    />
                    {calendar.name}
                  </label>
                </div>
              ))}
              {calendars.length === 0 && (
                <p className="text-sm italic text-muted-foreground">No calendars found</p>
              )}
            </div>
          </Card>
        )}

        {/* Calendar View */}
        <Card className="flex-1 overflow-hidden">
          {/* Month View */}
          {view === 'month' && (
            <>
              <div className="grid grid-cols-7 border-b bg-muted/50">
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
                  <div
                    key={day}
                    className="py-3 text-center text-sm font-medium text-muted-foreground"
                  >
                    {day}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-7">
                {daysInMonth.map((day) => (
                  <div
                    key={day.date.toISOString()}
                    className={cn(
                      'min-h-[100px] border-b border-r p-1',
                      !day.isCurrentMonth && 'bg-muted/30',
                      isSameDay(day.date, new Date()) && 'bg-primary/5',
                    )}
                  >
                    <div className="mb-1 flex items-center justify-between">
                      <span
                        className={cn(
                          'text-sm font-medium',
                          !day.isCurrentMonth && 'text-muted-foreground',
                          isSameDay(day.date, new Date()) && 'text-primary',
                        )}
                      >
                        {format(day.date, 'd')}
                      </span>
                      {isSameDay(day.date, new Date()) && (
                        <Badge variant="secondary" className="h-5 text-xs">
                          Today
                        </Badge>
                      )}
                    </div>
                    <div className="space-y-1">
                      {day.events.slice(0, 3).map((event) => (
                        <div
                          key={event.id}
                          className="cursor-pointer truncate rounded px-1.5 py-0.5 text-xs text-white"
                          style={{ backgroundColor: getEventColor(event) }}
                          onClick={() => handleEventClick(event)}
                        >
                          {event.title}
                        </div>
                      ))}
                      {day.events.length > 3 && (
                        <div
                          className="cursor-pointer text-center text-xs text-muted-foreground hover:underline"
                          onClick={() => {
                            setCurrentDate(day.date);
                            setView('day');
                          }}
                        >
                          +{day.events.length - 3} more
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Week View */}
          {view === 'week' && (
            <div className="flex h-[600px] flex-col">
              <div className="grid grid-cols-8 border-b">
                <div className="border-r px-2 py-3 text-center text-sm font-medium text-muted-foreground">
                  Time
                </div>
                {daysInWeek.map((day) => (
                  <div
                    key={day.date.toISOString()}
                    className={cn(
                      'border-r px-2 py-3 text-center text-sm font-medium',
                      isSameDay(day.date, new Date())
                        ? 'bg-primary/5 text-primary'
                        : 'text-muted-foreground',
                    )}
                  >
                    <div>{format(day.date, 'EEE')}</div>
                    <div>{format(day.date, 'MMM d')}</div>
                  </div>
                ))}
              </div>
              <div className="flex flex-1 overflow-y-auto">
                <div className="w-[60px] flex-shrink-0 border-r">
                  {Array.from({ length: 24 }).map((_, hour) => (
                    <div
                      key={`week-hour-label-${hour}`}
                      className="h-12 pr-2 pt-0 text-right text-xs text-muted-foreground"
                    >
                      {hour === 0
                        ? '12 AM'
                        : hour < 12
                          ? `${hour} AM`
                          : hour === 12
                            ? '12 PM'
                            : `${hour - 12} PM`}
                    </div>
                  ))}
                </div>
                <div className="grid flex-1 grid-cols-7">
                  {daysInWeek.map((day) => (
                    <div key={day.date.toISOString()} className="relative border-r">
                      {Array.from({ length: 24 }).map((_, hour) => (
                        <div key={`week-day-hour-${hour}`} className="h-12 border-b last:border-b-0" />
                      ))}
                      {day.events.map((event) => {
                        const { top, height } = getEventPosition(event);
                        return (
                          <div
                            key={event.id}
                            className="absolute left-0 right-1 cursor-pointer overflow-hidden rounded px-1 py-0.5 text-xs text-white"
                            style={{
                              top: `${top}px`,
                              height: `${height}px`,
                              backgroundColor: getEventColor(event),
                            }}
                            onClick={() => handleEventClick(event)}
                          >
                            <div className="truncate font-medium">{event.title}</div>
                            {height > 30 && (
                              <div className="truncate text-[10px] opacity-90">
                                {formatEventTime(new Date(event.startTime), event.isAllDay)} -{' '}
                                {formatEventTime(new Date(event.endTime), event.isAllDay)}
                              </div>
                            )}
                          </div>
                        );
                      })}
                      {/* Current time indicator */}
                      {isSameDay(day.date, new Date()) && (
                        <div
                          className="absolute left-0 right-0 z-10 border-t-2 border-red-500"
                          style={{ top: `${getCurrentTimePosition()}px` }}
                        >
                          <div className="absolute -left-[5px] -top-[5px] h-[10px] w-[10px] rounded-full bg-red-500" />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Day View */}
          {view === 'day' && (
            <div className="flex h-[600px] flex-col">
              <div className="border-b bg-muted/50 px-4 py-3">
                <div className="text-center font-medium">
                  {format(currentDate, 'EEEE, MMMM d, yyyy')}
                  {isSameDay(currentDate, new Date()) && (
                    <Badge className="ml-2" variant="secondary">
                      Today
                    </Badge>
                  )}
                </div>
              </div>
              <div className="flex flex-1 overflow-y-auto">
                <div className="w-[60px] flex-shrink-0 border-r">
                  {Array.from({ length: 24 }).map((_, hour) => (
                    <div
                      key={`day-hour-label-${hour}`}
                      className="h-12 pr-2 pt-0 text-right text-xs text-muted-foreground"
                    >
                      {hour === 0
                        ? '12 AM'
                        : hour < 12
                          ? `${hour} AM`
                          : hour === 12
                            ? '12 PM'
                            : `${hour - 12} PM`}
                    </div>
                  ))}
                </div>
                <div className="relative flex-1">
                  {Array.from({ length: 24 }).map((_, hour) => (
                    <div key={`day-hour-grid-${hour}`} className="h-12 border-b last:border-b-0" />
                  ))}
                  {eventsForDay.map((event) => {
                    const { top, height } = getEventPosition(event);
                    return (
                      <div
                        key={event.id}
                        className="absolute left-2 right-2 cursor-pointer rounded px-2 py-1 text-white"
                        style={{
                          top: `${top}px`,
                          height: `${height}px`,
                          backgroundColor: getEventColor(event),
                        }}
                        onClick={() => handleEventClick(event)}
                      >
                        <div className="truncate font-medium">{event.title}</div>
                        {height > 40 && (
                          <>
                            <div className="text-xs opacity-90">
                              {formatEventTime(new Date(event.startTime), event.isAllDay)} -{' '}
                              {formatEventTime(new Date(event.endTime), event.isAllDay)}
                            </div>
                            {event.location && height > 60 && (
                              <div className="mt-1 truncate text-xs opacity-90">
                                {event.location}
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    );
                  })}
                  {/* Current time indicator */}
                  {isSameDay(currentDate, new Date()) && (
                    <div
                      className="absolute left-0 right-0 z-10 border-t-2 border-red-500"
                      style={{ top: `${getCurrentTimePosition()}px` }}
                    >
                      <div className="absolute -left-[5px] -top-[5px] h-[10px] w-[10px] rounded-full bg-red-500" />
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Year View */}
          {view === 'year' && (
            <div className="grid grid-cols-1 gap-4 p-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {monthsInYear.map((monthData) => (
                <div
                  key={format(monthData.month, 'MMM-yyyy')}
                  className="cursor-pointer overflow-hidden rounded-lg border transition-shadow hover:shadow-md"
                  onClick={() => {
                    setCurrentDate(monthData.month);
                    setView('month');
                  }}
                >
                  <div
                    className={cn(
                      'border-b px-3 py-2 text-center font-medium',
                      isSameDay(new Date(), monthData.month) && 'bg-primary/10 text-primary',
                    )}
                  >
                    {format(monthData.month, 'MMMM')}
                  </div>
                  <div className="grid grid-cols-7 text-center text-xs">
                    {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
                      <div key={day} className="py-1 text-muted-foreground">
                        {day.charAt(0)}
                      </div>
                    ))}
                  </div>
                  <div className="grid grid-cols-7 text-center text-xs">
                    {monthData.days.map((day) => (
                      <div
                        key={day.date.toISOString()}
                        className={cn(
                          'relative py-1',
                          !day.isCurrentMonth && 'text-muted-foreground',
                          isSameDay(day.date, new Date()) && 'font-bold text-primary',
                        )}
                      >
                        {format(day.date, 'd')}
                        {day.events.length > 0 && (
                          <div className="absolute bottom-0 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-primary" />
                        )}
                      </div>
                    ))}
                  </div>
                  <div className="border-t p-2 text-xs">
                    <span className="font-medium">{monthData.events.length} events</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Agenda View */}
          {view === 'agenda' && agendaData && (
            <div className="p-4">
              {Object.keys(agendaData.eventsByDate).length > 0 ? (
                <div className="space-y-4">
                  {Object.keys(agendaData.eventsByDate)
                    .sort()
                    .map((dateKey) => {
                      const date = new Date(dateKey);
                      const dayEvents = agendaData.eventsByDate[dateKey];
                      return (
                        <div key={dateKey} className="overflow-hidden rounded-lg border">
                          <div
                            className={cn(
                              'border-b px-4 py-2 font-medium',
                              isSameDay(date, new Date()) && 'bg-primary/10 text-primary',
                            )}
                          >
                            {format(date, 'EEEE, MMMM d, yyyy')}
                            {isSameDay(date, new Date()) && (
                              <Badge className="ml-2" variant="secondary">
                                Today
                              </Badge>
                            )}
                          </div>
                          <div className="divide-y">
                            {dayEvents.map((event) => (
                              <div
                                key={event.id}
                                className="cursor-pointer p-3 hover:bg-muted/50"
                                onClick={() => handleEventClick(event)}
                              >
                                <div className="flex items-start gap-3">
                                  <div className="w-20 flex-shrink-0 text-sm text-muted-foreground">
                                    {formatEventTime(new Date(event.startTime), event.isAllDay)}
                                  </div>
                                  <div className="flex-1">
                                    <div className="flex items-center gap-2">
                                      <div
                                        className="h-2 w-2 rounded-full"
                                        style={{ backgroundColor: getEventColor(event) }}
                                      />
                                      <span className="font-medium">{event.title}</span>
                                    </div>
                                    {event.location && (
                                      <div className="mt-1 text-sm text-muted-foreground">
                                        {event.location}
                                      </div>
                                    )}
                                    <div className="mt-1 text-sm text-muted-foreground">
                                      {formatEventTime(new Date(event.startTime), event.isAllDay)} -{' '}
                                      {formatEventTime(new Date(event.endTime), event.isAllDay)}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                </div>
              ) : (
                <div className="py-8 text-center text-muted-foreground">
                  <CalendarIcon className="mx-auto mb-3 h-12 w-12 opacity-30" />
                  <p className="text-lg font-medium">No events found</p>
                  <p className="mt-1 text-sm">There are no events scheduled for this time period.</p>
                  <Button variant="outline" className="mt-4" onClick={handleCreateEvent}>
                    <Plus className="mr-2 h-4 w-4" />
                    Create Event
                  </Button>
                </div>
              )}
            </div>
          )}
        </Card>
      </div>

      {/* Event Dialog */}
      <EventDialog
        open={showEventDialog}
        onOpenChange={setShowEventDialog}
        event={selectedEvent}
        calendars={calendars}
        onEventUpdated={() => {
          queryClient.invalidateQueries({ queryKey: ['calendar', 'getEvents'] });
          setSelectedEvent(null);
        }}
        onEventDeleted={() => {
          queryClient.invalidateQueries({ queryKey: ['calendar', 'getEvents'] });
          setSelectedEvent(null);
        }}
      />

      {/* AI Chat Panel */}
      <CalendarChatPanel
        open={showChatPanel}
        onOpenChange={setShowChatPanel}
        onToolExecution={() => {
          queryClient.invalidateQueries({ queryKey: ['calendar', 'getEvents'] });
        }}
      />

      {/* Floating AI Button */}
      <div className="fixed bottom-6 right-6 z-50">
        <Button
          className="h-12 w-12 rounded-full shadow-lg"
          onClick={() => setShowChatPanel(true)}
          aria-label="Open AI Assistant"
        >
          <Zap className="h-5 w-5" />
        </Button>
      </div>
    </div>
  );
}
