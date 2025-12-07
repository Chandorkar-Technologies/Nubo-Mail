import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Trash2, MapPin, AlignLeft, Bell, Tag, Globe, Loader2, X, Video } from 'lucide-react';
import { useTRPC } from '@/providers/query-provider';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { addDays } from 'date-fns';
import type { CalendarEvent, Calendar } from '@/lib/calendar-types';
import { CALENDAR_COLORS, REMINDER_OPTIONS, DAYS_OF_WEEK } from '@/lib/calendar-types';
import { formatDateTimeForInput } from '@/lib/calendar-utils';

const formSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  description: z.string().optional(),
  startTime: z.string().min(1, 'Start time is required'),
  endTime: z.string().min(1, 'End time is required'),
  location: z.string().optional(),
  color: z.string().optional(),
  timezone: z.string(),
  isAllDay: z.boolean().default(false),
  calendarId: z.string().min(1, 'Calendar is required'),
  // Recurrence
  isRecurring: z.boolean().default(false),
  recurrenceFrequency: z.enum(['daily', 'weekly', 'monthly', 'yearly']).optional(),
  recurrenceInterval: z.number().min(1).max(365).optional(),
  recurrenceEndType: z.enum(['never', 'after', 'on']).optional(),
  recurrenceEndAfter: z.number().min(1).max(999).optional(),
  recurrenceEndOn: z.string().optional(),
  recurrenceByDay: z.array(z.string()).optional(),
  // Reminders
  reminders: z
    .array(
      z.object({
        minutesBefore: z.number(),
        method: z.enum(['email', 'push', 'popup']),
      }),
    )
    .default([]),
  // Conference
  conferenceType: z.enum(['nubo_meet', 'google_meet', 'zoom', 'teams']).optional().nullable(),
});

type FormData = z.infer<typeof formSchema>;

interface EventDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  event?: CalendarEvent | null;
  calendars: Calendar[];
  onEventUpdated?: () => void;
  onEventDeleted?: () => void;
}

export function EventDialog({
  open,
  onOpenChange,
  event,
  calendars,
  onEventUpdated,
  onEventDeleted,
}: EventDialogProps) {
  const trpc = useTRPC();
  const _queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('basic');
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Get available timezones
  const timezones = Intl.supportedValuesOf('timeZone');

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: '',
      description: '',
      startTime: new Date().toISOString().slice(0, 16),
      endTime: new Date(Date.now() + 3600000).toISOString().slice(0, 16),
      location: '',
      color: '',
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      isAllDay: false,
      calendarId: calendars[0]?.id ?? '',
      isRecurring: false,
      recurrenceFrequency: 'weekly',
      recurrenceInterval: 1,
      recurrenceEndType: 'never',
      recurrenceEndAfter: 10,
      recurrenceEndOn: addDays(new Date(), 30).toISOString().slice(0, 10),
      recurrenceByDay: [],
      reminders: [{ minutesBefore: 30, method: 'push' }],
      conferenceType: null,
    },
  });

  const isRecurring = form.watch('isRecurring');
  const recurrenceFrequency = form.watch('recurrenceFrequency');
  const recurrenceEndType = form.watch('recurrenceEndType');
  const isAllDay = form.watch('isAllDay');

  // Reset form when dialog opens/closes or event changes
  useEffect(() => {
    if (open) {
      setConfirmDelete(false);
      setActiveTab('basic');

      if (event) {
        // Cast recurrence rule to expected type
        const recRule = event.recurrenceRule as {
          frequency?: 'daily' | 'weekly' | 'monthly' | 'yearly';
          interval?: number;
          count?: number;
          until?: string;
          byDay?: string[];
        } | null;

        form.reset({
          title: event.title,
          description: event.description ?? '',
          startTime: formatDateTimeForInput(event.startTime, event.isAllDay),
          endTime: formatDateTimeForInput(event.endTime, event.isAllDay),
          location: event.location ?? '',
          color: event.color ?? '',
          timezone: event.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
          isAllDay: event.isAllDay ?? false,
          calendarId: event.calendarId,
          isRecurring: event.isRecurring ?? false,
          recurrenceFrequency: recRule?.frequency ?? 'weekly',
          recurrenceInterval: recRule?.interval ?? 1,
          recurrenceEndType: recRule?.until
            ? 'on'
            : recRule?.count
              ? 'after'
              : 'never',
          recurrenceEndAfter: recRule?.count ?? 10,
          recurrenceEndOn: recRule?.until
            ? recRule.until.slice(0, 10)
            : addDays(new Date(), 30).toISOString().slice(0, 10),
          recurrenceByDay: recRule?.byDay ?? [],
          reminders:
            event.reminders?.map((r) => ({
              minutesBefore: r.minutesBefore,
              method: r.method ?? 'push',
            })) ?? [{ minutesBefore: 30, method: 'push' }],
          conferenceType: event.conferenceType ?? null,
        });
      } else {
        form.reset({
          title: '',
          description: '',
          startTime: new Date().toISOString().slice(0, 16),
          endTime: new Date(Date.now() + 3600000).toISOString().slice(0, 16),
          location: '',
          color: '',
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          isAllDay: false,
          calendarId: calendars[0]?.id ?? '',
          isRecurring: false,
          recurrenceFrequency: 'weekly',
          recurrenceInterval: 1,
          recurrenceEndType: 'never',
          recurrenceEndAfter: 10,
          recurrenceEndOn: addDays(new Date(), 30).toISOString().slice(0, 10),
          recurrenceByDay: [],
          reminders: [{ minutesBefore: 30, method: 'push' }],
          conferenceType: null,
        });
      }
    }
  }, [open, event, calendars, form]);

  // Mutations
  const createEventMutation = useMutation(
    trpc.calendar.createEvent.mutationOptions({
      onSuccess: () => {
        toast.success('Event created successfully');
        onOpenChange(false);
        onEventUpdated?.();
      },
      onError: (error) => {
        toast.error('Failed to create event: ' + error.message);
      },
    }),
  );

  const updateEventMutation = useMutation(
    trpc.calendar.updateEvent.mutationOptions({
      onSuccess: () => {
        toast.success('Event updated successfully');
        onOpenChange(false);
        onEventUpdated?.();
      },
      onError: (error) => {
        toast.error('Failed to update event: ' + error.message);
      },
    }),
  );

  const deleteEventMutation = useMutation(
    trpc.calendar.deleteEvent.mutationOptions({
      onSuccess: () => {
        toast.success('Event deleted successfully');
        onOpenChange(false);
        onEventDeleted?.();
      },
      onError: (error) => {
        toast.error('Failed to delete event: ' + error.message);
      },
    }),
  );

  const isLoading =
    createEventMutation.isPending ||
    updateEventMutation.isPending ||
    deleteEventMutation.isPending;

  const onSubmit = (data: FormData) => {
    const eventData = {
      title: data.title,
      description: data.description,
      startTime: data.startTime,
      endTime: data.endTime,
      location: data.location,
      color: data.color || undefined,
      timezone: data.timezone,
      isAllDay: data.isAllDay,
      calendarId: data.calendarId,
      isRecurring: data.isRecurring,
      recurrenceRule: data.isRecurring
        ? {
            frequency: data.recurrenceFrequency!,
            interval: data.recurrenceInterval!,
            count: data.recurrenceEndType === 'after' ? data.recurrenceEndAfter : undefined,
            until: data.recurrenceEndType === 'on' ? data.recurrenceEndOn : undefined,
            byDay: data.recurrenceByDay?.length ? data.recurrenceByDay : undefined,
          }
        : undefined,
      reminders: data.reminders,
      conferenceType: data.conferenceType,
    };

    if (event) {
      updateEventMutation.mutate({
        id: event.id,
        ...eventData,
      });
    } else {
      createEventMutation.mutate(eventData);
    }
  };

  const handleDelete = () => {
    if (!event) return;

    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }

    deleteEventMutation.mutate({ id: event.id });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{event ? 'Edit Event' : 'Create Event'}</DialogTitle>
          <DialogDescription>
            {event ? 'Update the event details below.' : 'Fill in the details for your new event.'}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="basic">Basic</TabsTrigger>
                <TabsTrigger value="recurrence">Recurrence</TabsTrigger>
                <TabsTrigger value="options">Options</TabsTrigger>
              </TabsList>

              <TabsContent value="basic" className="space-y-4">
                {/* Title */}
                <FormField
                  control={form.control}
                  name="title"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Title</FormLabel>
                      <FormControl>
                        <Input placeholder="Event title" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Calendar */}
                <FormField
                  control={form.control}
                  name="calendarId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Calendar</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select a calendar" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {calendars.length === 0 ? (
                            <div className="px-2 py-1.5 text-sm text-muted-foreground">
                              Loading calendars...
                            </div>
                          ) : (
                            calendars.map((cal) => (
                              <SelectItem key={cal.id} value={cal.id}>
                                <div className="flex items-center gap-2">
                                  <span
                                    className="h-3 w-3 rounded-full"
                                    style={{ backgroundColor: cal.color }}
                                  />
                                  {cal.name}
                                </div>
                              </SelectItem>
                            ))
                          )}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* All Day */}
                <FormField
                  control={form.control}
                  name="isAllDay"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                      <FormControl>
                        <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                      </FormControl>
                      <div className="space-y-1 leading-none">
                        <FormLabel>All day event</FormLabel>
                      </div>
                    </FormItem>
                  )}
                />

                {/* Start/End Time */}
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="startTime"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Start</FormLabel>
                        <FormControl>
                          <Input type={isAllDay ? 'date' : 'datetime-local'} {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="endTime"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>End</FormLabel>
                        <FormControl>
                          <Input type={isAllDay ? 'date' : 'datetime-local'} {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                {/* Location */}
                <FormField
                  control={form.control}
                  name="location"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        <MapPin className="mr-1 inline h-4 w-4" />
                        Location
                      </FormLabel>
                      <FormControl>
                        <Input placeholder="Add location" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Description */}
                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        <AlignLeft className="mr-1 inline h-4 w-4" />
                        Description
                      </FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Add description"
                          className="min-h-[100px]"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Video Conference */}
                <FormField
                  control={form.control}
                  name="conferenceType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        <Video className="mr-1 inline h-4 w-4" />
                        Video Conference
                      </FormLabel>
                      <Select
                        onValueChange={(value) =>
                          field.onChange(value === 'none' ? null : value)
                        }
                        value={field.value ?? 'none'}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Add video conference" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="none">No video conference</SelectItem>
                          <SelectItem value="nubo_meet">Nubo Meet</SelectItem>
                          <SelectItem value="google_meet">Google Meet</SelectItem>
                          <SelectItem value="zoom">Zoom</SelectItem>
                          <SelectItem value="teams">Microsoft Teams</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </TabsContent>

              <TabsContent value="recurrence" className="space-y-4">
                {/* Is Recurring */}
                <FormField
                  control={form.control}
                  name="isRecurring"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                      <FormControl>
                        <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                      </FormControl>
                      <div className="space-y-1 leading-none">
                        <FormLabel>Repeat this event</FormLabel>
                      </div>
                    </FormItem>
                  )}
                />

                {isRecurring && (
                  <>
                    {/* Frequency */}
                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="recurrenceFrequency"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Frequency</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value}>
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="daily">Daily</SelectItem>
                                <SelectItem value="weekly">Weekly</SelectItem>
                                <SelectItem value="monthly">Monthly</SelectItem>
                                <SelectItem value="yearly">Yearly</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="recurrenceInterval"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Every</FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                min={1}
                                max={365}
                                {...field}
                                onChange={(e) => field.onChange(parseInt(e.target.value) || 1)}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    {/* Days of week (for weekly) */}
                    {recurrenceFrequency === 'weekly' && (
                      <FormField
                        control={form.control}
                        name="recurrenceByDay"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Repeat on</FormLabel>
                            <div className="flex gap-2">
                              {DAYS_OF_WEEK.map((day) => (
                                <Button
                                  key={day.value}
                                  type="button"
                                  variant={field.value?.includes(day.value) ? 'default' : 'outline'}
                                  size="sm"
                                  className="h-8 w-8 p-0"
                                  onClick={() => {
                                    const current = field.value ?? [];
                                    if (current.includes(day.value)) {
                                      field.onChange(current.filter((d) => d !== day.value));
                                    } else {
                                      field.onChange([...current, day.value]);
                                    }
                                  }}
                                >
                                  {day.short}
                                </Button>
                              ))}
                            </div>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    )}

                    {/* End Type */}
                    <FormField
                      control={form.control}
                      name="recurrenceEndType"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Ends</FormLabel>
                          <FormControl>
                            <RadioGroup
                              onValueChange={field.onChange}
                              value={field.value}
                              className="space-y-2"
                            >
                              <div className="flex items-center space-x-2">
                                <RadioGroupItem value="never" id="never" />
                                <label htmlFor="never">Never</label>
                              </div>
                              <div className="flex items-center space-x-2">
                                <RadioGroupItem value="after" id="after" />
                                <label htmlFor="after">After</label>
                                {recurrenceEndType === 'after' && (
                                  <FormField
                                    control={form.control}
                                    name="recurrenceEndAfter"
                                    render={({ field: afterField }) => (
                                      <Input
                                        type="number"
                                        min={1}
                                        max={999}
                                        className="ml-2 w-20"
                                        {...afterField}
                                        onChange={(e) =>
                                          afterField.onChange(parseInt(e.target.value) || 1)
                                        }
                                      />
                                    )}
                                  />
                                )}
                                {recurrenceEndType === 'after' && (
                                  <span className="ml-2">occurrences</span>
                                )}
                              </div>
                              <div className="flex items-center space-x-2">
                                <RadioGroupItem value="on" id="on" />
                                <label htmlFor="on">On</label>
                                {recurrenceEndType === 'on' && (
                                  <FormField
                                    control={form.control}
                                    name="recurrenceEndOn"
                                    render={({ field: onField }) => (
                                      <Input type="date" className="ml-2 w-40" {...onField} />
                                    )}
                                  />
                                )}
                              </div>
                            </RadioGroup>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </>
                )}
              </TabsContent>

              <TabsContent value="options" className="space-y-4">
                {/* Timezone */}
                <FormField
                  control={form.control}
                  name="timezone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        <Globe className="mr-1 inline h-4 w-4" />
                        Timezone
                      </FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent className="max-h-[200px]">
                          {timezones.map((tz) => (
                            <SelectItem key={tz} value={tz}>
                              {tz}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Color */}
                <FormField
                  control={form.control}
                  name="color"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        <Tag className="mr-1 inline h-4 w-4" />
                        Color
                      </FormLabel>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          variant={!field.value ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => field.onChange('')}
                        >
                          Calendar default
                        </Button>
                        {CALENDAR_COLORS.map((color) => (
                          <button
                            key={color.value}
                            type="button"
                            className={cn(
                              'h-8 w-8 rounded-full',
                              field.value === color.value && 'ring-2 ring-offset-2 ring-primary',
                            )}
                            style={{ backgroundColor: color.value }}
                            onClick={() => field.onChange(color.value)}
                            title={color.name}
                          />
                        ))}
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Reminders */}
                <FormField
                  control={form.control}
                  name="reminders"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        <Bell className="mr-1 inline h-4 w-4" />
                        Reminders
                      </FormLabel>
                      <div className="space-y-2">
                        {field.value?.map((reminder, index) => (
                          <div key={`reminder-${reminder.minutesBefore}-${index}`} className="flex items-center gap-2">
                            <Select
                              value={reminder.minutesBefore.toString()}
                              onValueChange={(value) => {
                                const newReminders = [...(field.value ?? [])];
                                newReminders[index] = {
                                  ...newReminders[index],
                                  minutesBefore: parseInt(value),
                                };
                                field.onChange(newReminders);
                              }}
                            >
                              <SelectTrigger className="w-[180px]">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {REMINDER_OPTIONS.map((opt) => (
                                  <SelectItem key={opt.value} value={opt.value.toString()}>
                                    {opt.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <Select
                              value={reminder.method}
                              onValueChange={(value: 'email' | 'push' | 'popup') => {
                                const newReminders = [...(field.value ?? [])];
                                newReminders[index] = {
                                  ...newReminders[index],
                                  method: value,
                                };
                                field.onChange(newReminders);
                              }}
                            >
                              <SelectTrigger className="w-[120px]">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="push">Push</SelectItem>
                                <SelectItem value="email">Email</SelectItem>
                                <SelectItem value="popup">Popup</SelectItem>
                              </SelectContent>
                            </Select>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => {
                                const newReminders = field.value?.filter((_, i) => i !== index);
                                field.onChange(newReminders);
                              }}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        ))}
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            const newReminders = [
                              ...(field.value ?? []),
                              { minutesBefore: 30, method: 'push' as const },
                            ];
                            field.onChange(newReminders);
                          }}
                        >
                          Add reminder
                        </Button>
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </TabsContent>
            </Tabs>

            <DialogFooter className="flex items-center justify-between">
              {event && (
                <Button
                  type="button"
                  variant={confirmDelete ? 'destructive' : 'outline'}
                  onClick={handleDelete}
                  disabled={isLoading}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  {confirmDelete ? 'Confirm Delete' : 'Delete'}
                </Button>
              )}
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={isLoading}>
                  {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {event ? 'Update' : 'Create'}
                </Button>
              </div>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
