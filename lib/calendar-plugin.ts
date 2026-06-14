import { registerPlugin } from '@capacitor/core';

export interface NativeCalendar {
  id: string;
  name: string;
  account: string;
  color: number;
}

export interface NativeCalendarEvent {
  id: string;
  title: string;
  date: string;       // YYYY-MM-DD
  startTime: string;  // HH:mm
  endTime: string;    // HH:mm
  calendarId: string;
  allDay: boolean;
}

export interface CalendarPluginDef {
  requestPermission(): Promise<{ granted: boolean }>;
  getCalendars(): Promise<{ calendars: NativeCalendar[] }>;
  getEvents(options?: { calendarId?: string; startMs?: number; endMs?: number }): Promise<{ events: NativeCalendarEvent[] }>;
}

const CalendarPlugin = registerPlugin<CalendarPluginDef>('Calendar');
export default CalendarPlugin;
