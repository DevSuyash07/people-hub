import { AppLayout } from "@/components/AppLayout";
import { PageHeader } from "@/components/PageHeader";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { CalendarDays, Plus, Trash2, MapPin, PartyPopper } from "lucide-react";
import { format, parseISO, isAfter, startOfDay } from "date-fns";

type Holiday = {
  id: string;
  name: string;
  holiday_date: string;
  description: string | null;
  is_recurring: boolean;
};

type EventType = "meeting" | "training" | "celebration" | "announcement" | "other";
type CalendarEvent = {
  id: string;
  title: string;
  description: string | null;
  event_date: string;
  end_date: string | null;
  event_type: EventType;
  location: string | null;
};

const eventColors: Record<EventType, string> = {
  meeting: "bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/20",
  training: "bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-500/20",
  celebration: "bg-pink-500/10 text-pink-700 dark:text-pink-300 border-pink-500/20",
  announcement: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20",
  other: "bg-muted text-muted-foreground border-border",
};

export default function CalendarPage() {
  const { role } = useAuth();
  const canManage = role === "admin" || role === "hr";

  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);

  const [holidayOpen, setHolidayOpen] = useState(false);
  const [eventOpen, setEventOpen] = useState(false);

  const [hForm, setHForm] = useState({ name: "", holiday_date: "", description: "" });
  const [eForm, setEForm] = useState<{
    title: string;
    description: string;
    event_date: string;
    end_date: string;
    event_type: EventType;
    location: string;
  }>({ title: "", description: "", event_date: "", end_date: "", event_type: "meeting", location: "" });

  async function load() {
    setLoading(true);
    const [h, e] = await Promise.all([
      supabase.from("holidays").select("*").order("holiday_date", { ascending: true }),
      supabase.from("calendar_events").select("*").order("event_date", { ascending: true }),
    ]);
    if (h.error) toast.error(h.error.message);
    else setHolidays(h.data as Holiday[]);
    if (e.error) toast.error(e.error.message);
    else setEvents(e.data as CalendarEvent[]);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  const today = startOfDay(new Date());
  const upcomingHolidays = useMemo(
    () => holidays.filter((h) => !isAfter(today, parseISO(h.holiday_date))),
    [holidays, today]
  );
  const upcomingEvents = useMemo(
    () => events.filter((e) => !isAfter(today, parseISO(e.event_date))),
    [events, today]
  );
  const pastHolidays = useMemo(
    () => holidays.filter((h) => isAfter(today, parseISO(h.holiday_date))),
    [holidays, today]
  );

  async function addHoliday() {
    if (!hForm.name || !hForm.holiday_date) {
      toast.error("Name and date required");
      return;
    }
    const { error } = await supabase.from("holidays").insert({
      name: hForm.name,
      holiday_date: hForm.holiday_date,
      description: hForm.description || null,
    });
    if (error) return toast.error(error.message);
    toast.success("Holiday added");
    setHForm({ name: "", holiday_date: "", description: "" });
    setHolidayOpen(false);
    load();
  }

  async function deleteHoliday(id: string) {
    const { error } = await supabase.from("holidays").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Removed");
    load();
  }

  async function addEvent() {
    if (!eForm.title || !eForm.event_date) {
      toast.error("Title and date required");
      return;
    }
    const { error } = await supabase.from("calendar_events").insert({
      title: eForm.title,
      description: eForm.description || null,
      event_date: eForm.event_date,
      end_date: eForm.end_date || null,
      event_type: eForm.event_type,
      location: eForm.location || null,
      is_company_wide: true,
    });
    if (error) return toast.error(error.message);
    toast.success("Event added");
    setEForm({ title: "", description: "", event_date: "", end_date: "", event_type: "meeting", location: "" });
    setEventOpen(false);
    load();
  }

  async function deleteEvent(id: string) {
    const { error } = await supabase.from("calendar_events").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Removed");
    load();
  }

  return (
    <AppLayout>
      <PageHeader
        eyebrow="Calendar"
        title="Company Calendar"
        description="Holidays and company-wide events at a glance."
      />

      {canManage && (
        <div className="flex flex-wrap gap-2 mb-8">
          <Dialog open={holidayOpen} onOpenChange={setHolidayOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm">
                <Plus className="h-4 w-4 mr-2" /> Add Holiday
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>New Holiday</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <div>
                  <Label>Name</Label>
                  <Input
                    value={hForm.name}
                    onChange={(e) => setHForm({ ...hForm, name: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Date</Label>
                  <Input
                    type="date"
                    value={hForm.holiday_date}
                    onChange={(e) => setHForm({ ...hForm, holiday_date: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Description</Label>
                  <Textarea
                    value={hForm.description}
                    onChange={(e) => setHForm({ ...hForm, description: e.target.value })}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button onClick={addHoliday}>Add</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={eventOpen} onOpenChange={setEventOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="h-4 w-4 mr-2" /> Add Event
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>New Event</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <div>
                  <Label>Title</Label>
                  <Input
                    value={eForm.title}
                    onChange={(e) => setEForm({ ...eForm, title: e.target.value })}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Start date</Label>
                    <Input
                      type="date"
                      value={eForm.event_date}
                      onChange={(e) => setEForm({ ...eForm, event_date: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>End date (optional)</Label>
                    <Input
                      type="date"
                      value={eForm.end_date}
                      onChange={(e) => setEForm({ ...eForm, end_date: e.target.value })}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Type</Label>
                    <Select
                      value={eForm.event_type}
                      onValueChange={(v) => setEForm({ ...eForm, event_type: v as EventType })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="meeting">Meeting</SelectItem>
                        <SelectItem value="training">Training</SelectItem>
                        <SelectItem value="celebration">Celebration</SelectItem>
                        <SelectItem value="announcement">Announcement</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Location</Label>
                    <Input
                      value={eForm.location}
                      onChange={(e) => setEForm({ ...eForm, location: e.target.value })}
                    />
                  </div>
                </div>
                <div>
                  <Label>Description</Label>
                  <Textarea
                    value={eForm.description}
                    onChange={(e) => setEForm({ ...eForm, description: e.target.value })}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button onClick={addEvent}>Add</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base font-medium">
              <CalendarDays className="h-4 w-4" /> Upcoming Events
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {loading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : upcomingEvents.length === 0 ? (
              <p className="text-sm text-muted-foreground">No upcoming events.</p>
            ) : (
              upcomingEvents.map((e) => (
                <div
                  key={e.id}
                  className="flex items-start justify-between gap-3 p-3 rounded-md border border-border"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className={eventColors[e.event_type]}>
                        {e.event_type}
                      </Badge>
                      <span className="font-medium text-sm">{e.title}</span>
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {format(parseISO(e.event_date), "EEE, MMM d, yyyy")}
                      {e.end_date && ` – ${format(parseISO(e.end_date), "MMM d, yyyy")}`}
                    </div>
                    {e.location && (
                      <div className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                        <MapPin className="h-3 w-3" /> {e.location}
                      </div>
                    )}
                    {e.description && (
                      <p className="text-xs text-muted-foreground mt-1.5">{e.description}</p>
                    )}
                  </div>
                  {canManage && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => deleteEvent(e.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base font-medium">
              <PartyPopper className="h-4 w-4" /> Upcoming Holidays
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {loading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : upcomingHolidays.length === 0 ? (
              <p className="text-sm text-muted-foreground">No upcoming holidays.</p>
            ) : (
              upcomingHolidays.map((h) => (
                <div
                  key={h.id}
                  className="flex items-start justify-between gap-3 p-3 rounded-md border border-border"
                >
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm">{h.name}</div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {format(parseISO(h.holiday_date), "EEE, MMM d, yyyy")}
                    </div>
                    {h.description && (
                      <p className="text-xs text-muted-foreground mt-1">{h.description}</p>
                    )}
                  </div>
                  {canManage && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => deleteHoliday(h.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {pastHolidays.length > 0 && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-base font-medium text-muted-foreground">
              Past Holidays ({pastHolidays.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {pastHolidays.map((h) => (
                <div key={h.id} className="text-xs p-2 rounded border border-border/50">
                  <span className="font-medium">{h.name}</span>
                  <span className="text-muted-foreground ml-2">
                    {format(parseISO(h.holiday_date), "MMM d")}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </AppLayout>
  );
}
