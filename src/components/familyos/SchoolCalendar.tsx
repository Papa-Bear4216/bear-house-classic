import { useEffect, useState, type CSSProperties, type FormEvent } from 'react';
import { ArrowRight, CalendarDays, ChevronLeft, ChevronRight, Plus, Trash2 } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useAppContext } from '@/contexts/AppContext';
import { saveJSON, uid, canDelete } from '@/lib/familyos';
import { onSyncUpdate } from '@/lib/sync';
import { localDateKey, nextSchoolEvent, readSchoolEvents, schoolEventKey, schoolEventPrefix, schoolMonthDays, SCHOOL_EVENT_KINDS, type SchoolEvent, type SchoolEventKind } from '@/lib/schoolEvents';
import '@/styles/school-calendar.css';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function displayDate(date: string): string {
  return new Date(`${date}T12:00:00`).toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
}

export default function SchoolCalendar() {
  const { currentUser, currentRole, householdId } = useAppContext();
  const today = localDateKey(new Date());
  const [events, setEvents] = useState<SchoolEvent[]>(() => householdId ? readSchoolEvents(localStorage, householdId) : []);
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [selected, setSelected] = useState(today);
  const [title, setTitle] = useState('');
  const [details, setDetails] = useState('');
  const [kind, setKind] = useState<SchoolEventKind>('dress-up');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    setEvents(householdId ? readSchoolEvents(localStorage, householdId) : []);
    if (!householdId) return;
    return onSyncUpdate((key) => {
      if (key === '*' || key.startsWith(schoolEventPrefix(householdId))) {
        setEvents(readSchoolEvents(localStorage, householdId));
      }
    });
  }, [householdId]);

  const save = (entry: SchoolEvent) => {
    if (!householdId) return;
    saveJSON(schoolEventKey(householdId, entry.id), entry);
    setEvents(readSchoolEvents(localStorage, householdId));
  };

  const upcoming = nextSchoolEvent(events, today);
  const selectedEvents = events.filter((event) => event.date === selected);
  const shiftMonth = (difference: number) => setMonth((previous) => new Date(previous.getFullYear(), previous.getMonth() + difference, 1));

  const addEvent = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!title.trim() || !currentUser || !householdId) return;
    save({ id: uid(), date: selected, kind, title: title.trim(), details: details.trim(), author: currentUser.name, authorId: currentUser.id, createdAt: Date.now() });
    setTitle('');
    setDetails('');
    setNotice(`Added to ${displayDate(selected)}.`);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button type="button" className="fo-school-trigger focus-ring">
          <span className="fo-school-trigger-icon"><CalendarDays className="w-5 h-5" aria-hidden="true" /></span>
          <span><strong>School days</strong><small>{upcoming ? `${displayDate(upcoming.date)} · ${upcoming.title}` : 'Dress-up days, pep rallies, meets & more'}</small></span>
          <ArrowRight className="w-5 h-5" aria-hidden="true" />
        </button>
      </DialogTrigger>
      <DialogContent className="fo-school-dialog">
        <div className="fo-school-head">
          <span className="fo-school-kicker">The family calendar</span>
          <DialogTitle>School days, sorted.</DialogTitle>
          <DialogDescription>Mark the little things worth remembering together.</DialogDescription>
        </div>
        <div className="fo-school-body">
          <div className="fo-school-month">
            <div className="fo-school-month-nav">
              <button type="button" onClick={() => shiftMonth(-1)} aria-label="Previous month"><ChevronLeft className="w-5 h-5" /></button>
              <strong>{month.toLocaleDateString([], { month: 'long', year: 'numeric' })}</strong>
              <button type="button" onClick={() => shiftMonth(1)} aria-label="Next month"><ChevronRight className="w-5 h-5" /></button>
            </div>
            <div className="fo-school-grid">
              {WEEKDAYS.map((day) => <span key={day} className="fo-school-weekday">{day}</span>)}
              {schoolMonthDays(month.getFullYear(), month.getMonth()).map(({ date, inMonth }) => {
                const dayEvents = events.filter((event) => event.date === date);
                return <button key={date} type="button" onClick={() => { setSelected(date); setNotice(''); if (!inMonth) setMonth(new Date(`${date}T12:00:00`)); }}
                  aria-label={`${displayDate(date)}${dayEvents.length ? `, ${dayEvents.length} ${dayEvents.length === 1 ? 'event' : 'events'}` : ''}`}
                  aria-pressed={date === selected}
                  className={`fo-school-day${inMonth ? '' : ' fo-school-day-outside'}${date === today ? ' fo-school-day-today' : ''}${date === selected ? ' fo-school-day-selected' : ''}`}>
                  <span>{Number(date.slice(-2))}</span><i aria-hidden="true">{dayEvents.slice(0, 3).map((entry) => <b key={entry.id} style={{ backgroundColor: SCHOOL_EVENT_KINDS.find((option) => option.id === entry.kind)?.color }} />)}</i>
                </button>;
              })}
            </div>
            <button type="button" className="fo-school-today" onClick={() => { const now = new Date(); setMonth(new Date(now.getFullYear(), now.getMonth(), 1)); setSelected(localDateKey(now)); }}>Jump to today</button>
          </div>
          <div className="fo-school-details">
            <div className="fo-school-selected"><span>On the calendar</span><h3>{displayDate(selected)}</h3></div>
            <div className="fo-school-events">
              {selectedEvents.length === 0 && <p className="fo-school-empty">Nothing here yet. Give this day a little story.</p>}
              {selectedEvents.map((entry) => {
                const eventKind = SCHOOL_EVENT_KINDS.find((option) => option.id === entry.kind);
                return <div className="fo-school-event" key={entry.id} style={{ borderLeftColor: eventKind?.color }}>
                  <div><span>{eventKind?.label} · added by {entry.author}</span><strong>{entry.title}</strong>{entry.details && <p>{entry.details}</p>}</div>
                  {(entry.authorId === currentUser?.id || (currentRole && canDelete(currentRole))) && <button type="button" aria-label={`Remove ${entry.title}`} onClick={() => { if (window.confirm(`Remove “${entry.title}” from the calendar?`)) save({ ...entry, deletedAt: Date.now() }); }}><Trash2 className="w-4 h-4" /></button>}
                </div>;
              })}
            </div>
            <form className="fo-school-form" onSubmit={addEvent}>
              <label htmlFor="fo-school-title">Add to this day</label>
              <input id="fo-school-title" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. Wear your school colors" maxLength={100} required />
              <div className="fo-school-kinds" aria-label="Event type">{SCHOOL_EVENT_KINDS.map((option) => <button key={option.id} type="button" onClick={() => setKind(option.id)} aria-pressed={kind === option.id} style={{ '--school-kind': option.color } as CSSProperties}>{option.label}</button>)}</div>
              <input value={details} onChange={(event) => setDetails(event.target.value)} placeholder="What to bring, where to meet…" aria-label="Optional event details" maxLength={200} />
              <button type="submit" className="fo-school-add"><Plus className="w-4 h-4" /> Add school day</button>
              <p role="status" className="fo-school-notice">{notice}</p>
            </form>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
