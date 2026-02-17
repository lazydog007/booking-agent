"use client";

import type { PointerEvent as ReactPointerEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type ViewMode = "day" | "week";
type Role = "owner" | "admin" | "staff" | "viewer";

type Resource = {
  id: string;
  displayName: string;
  isDefault: boolean;
};

type AppointmentType = {
  id: string;
  name: string;
};

type Appointment = {
  id: string;
  appointmentTypeId: string;
  clientId: string;
  resourceId: string;
  status: string;
  startAt: string;
  endAt: string;
  reasonForVisit?: string | null;
};

type BusyBlock = {
  id: string;
  resourceId: string;
  startAt: string;
  endAt: string;
  reason?: string | null;
  source: string;
};

type SessionData = {
  user: {
    id: string;
    tenant_id: string;
    email: string;
    name: string;
    role: Role;
  };
  tenant: {
    id: string;
    timezone: string;
    name: string;
  };
};

type CalendarEvent = {
  id: string;
  kind: "appointment" | "busy";
  title: string;
  start: Date;
  end: Date;
  resourceId: string;
  appointmentTypeId?: string;
  status?: string;
  raw: Appointment | BusyBlock;
};

type DragState = {
  eventId: string;
  mode: "move" | "resize";
  originY: number;
  originX: number;
  originalStart: Date;
  originalEnd: Date;
  currentStart: Date;
  currentEnd: Date;
};

const HOUR_START = 6;
const HOUR_END = 22;
const MINUTE_HEIGHT = 1.1;
const SNAP_MINUTES = 15;

function toIso(date: Date) {
  return date.toISOString();
}

function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * 60_000);
}

function minutesBetween(start: Date, end: Date) {
  return Math.round((end.getTime() - start.getTime()) / 60_000);
}

function floorToSnap(minutes: number) {
  return Math.round(minutes / SNAP_MINUTES) * SNAP_MINUTES;
}

function formatHourLabel(hour: number) {
  const suffix = hour >= 12 ? "PM" : "AM";
  const normalized = hour % 12 === 0 ? 12 : hour % 12;
  return `${normalized}:00 ${suffix}`;
}

function getWeekStart(date: Date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function getDays(view: ViewMode, selectedDate: Date) {
  if (view === "day") {
    const day = new Date(selectedDate);
    day.setHours(0, 0, 0, 0);
    return [day];
  }
  const start = getWeekStart(selectedDate);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
}

function getRange(days: Date[]) {
  const firstDay = days.at(0);
  const lastDay = days.at(-1);
  if (!firstDay || !lastDay) {
    const now = new Date();
    const fromNow = new Date(now);
    fromNow.setHours(HOUR_START, 0, 0, 0);
    const toNow = new Date(now);
    toNow.setHours(HOUR_END, 59, 59, 999);
    return { from: fromNow, to: toNow };
  }
  const from = new Date(firstDay);
  from.setHours(HOUR_START, 0, 0, 0);
  const to = new Date(lastDay);
  to.setHours(HOUR_END, 59, 59, 999);
  return { from, to };
}

function eventColor(event: CalendarEvent) {
  if (event.kind === "busy") return "var(--event-busy)";
  if (event.status === "canceled") return "var(--event-canceled)";
  if (event.status === "completed") return "var(--event-completed)";
  if (event.status === "hold") return "var(--event-hold)";
  return "var(--event-booked)";
}

function sameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export default function CalendarDashboard({ initialSession }: { initialSession: SessionData }) {
  const [session] = useState(initialSession);
  const [view, setView] = useState<ViewMode>("week");
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [resources, setResources] = useState<Resource[]>([]);
  const [resourceId, setResourceId] = useState("");
  const [appointmentTypes, setAppointmentTypes] = useState<AppointmentType[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [busyBlocks, setBusyBlocks] = useState<BusyBlock[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [saving, setSaving] = useState(false);

  const [newBlockStart, setNewBlockStart] = useState("");
  const [newBlockEnd, setNewBlockEnd] = useState("");
  const [newBlockReason, setNewBlockReason] = useState("");

  const gridRef = useRef<HTMLDivElement | null>(null);

  const canModify = session.user.role === "owner" || session.user.role === "admin" || session.user.role === "staff";

  const days = useMemo(() => getDays(view, selectedDate), [view, selectedDate]);
  const { from, to } = useMemo(() => getRange(days), [days]);

  const eventItems = useMemo<CalendarEvent[]>(() => {
    const typeMap = new Map(appointmentTypes.map((row) => [row.id, row.name]));
    const appointmentEvents = appointments.map((item) => ({
      id: item.id,
      kind: "appointment" as const,
      title: typeMap.get(item.appointmentTypeId) ?? "Appointment",
      start: new Date(item.startAt),
      end: new Date(item.endAt),
      resourceId: item.resourceId,
      appointmentTypeId: item.appointmentTypeId,
      status: item.status,
      raw: item
    }));
    const busyEvents = busyBlocks.map((item) => ({
      id: item.id,
      kind: "busy" as const,
      title: item.reason || "Busy block",
      start: new Date(item.startAt),
      end: new Date(item.endAt),
      resourceId: item.resourceId,
      raw: item
    }));
    return [...appointmentEvents, ...busyEvents];
  }, [appointments, busyBlocks, appointmentTypes]);

  const loadMetadata = useCallback(async () => {
    const [resourcesRes, typesRes] = await Promise.all([
      fetch("/api/dashboard/resources"),
      fetch("/api/dashboard/appointment-types")
    ]);

    if (!resourcesRes.ok) throw new Error("Failed to load resources");
    if (!typesRes.ok) throw new Error("Failed to load appointment types");

    const resourcesJson = (await resourcesRes.json()) as { resources: Resource[] };
    const typesJson = (await typesRes.json()) as { appointment_types: AppointmentType[] };

    setResources(resourcesJson.resources);
    setAppointmentTypes(typesJson.appointment_types);

    if (!resourceId && resourcesJson.resources.length > 0) {
      const defaultResource = resourcesJson.resources.find((r) => r.isDefault) ?? resourcesJson.resources[0];
      if (defaultResource) setResourceId(defaultResource.id);
    }
  }, [resourceId]);

  const loadCalendarData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        from: toIso(from),
        to: toIso(to)
      });
      if (resourceId) params.set("resource_id", resourceId);

      const [appointmentsRes, blocksRes] = await Promise.all([
        fetch(`/api/dashboard/appointments?${params.toString()}`),
        fetch(`/api/dashboard/busy-blocks?${params.toString()}`)
      ]);

      if (!appointmentsRes.ok || !blocksRes.ok) {
        throw new Error("Failed to load calendar data");
      }

      const appointmentJson = (await appointmentsRes.json()) as { appointments: Appointment[] };
      const blockJson = (await blocksRes.json()) as { busy_blocks: BusyBlock[] };

      setAppointments(appointmentJson.appointments || []);
      setBusyBlocks(blockJson.busy_blocks || []);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [from, to, resourceId]);

  useEffect(() => {
    void loadMetadata();
  }, [loadMetadata]);

  useEffect(() => {
    void loadCalendarData();
  }, [loadCalendarData]);

  useEffect(() => {
    const params = new URLSearchParams({
      from: toIso(from),
      to: toIso(to)
    });
    if (resourceId) params.set("resource_id", resourceId);

    const source = new EventSource(`/api/dashboard/stream?${params.toString()}`);
    source.addEventListener("refresh", () => {
      void loadCalendarData();
    });
    source.onerror = () => {
      source.close();
    };

    const fallbackPoll = setInterval(() => {
      void loadCalendarData();
    }, 30_000);

    return () => {
      clearInterval(fallbackPoll);
      source.close();
    };
  }, [from, to, resourceId, loadCalendarData]);

  useEffect(() => {
    if (!drag) return;

    const onMove = (event: PointerEvent) => {
      if (!gridRef.current) return;

      const rect = gridRef.current.getBoundingClientRect();
      const dayWidth = rect.width / days.length;
      const deltaY = event.clientY - drag.originY;
      const deltaX = event.clientX - drag.originX;
      const minuteDelta = floorToSnap(deltaY / MINUTE_HEIGHT);
      const dayDelta = Math.round(deltaX / dayWidth);

      const startMoved = addMinutes(drag.originalStart, minuteDelta + dayDelta * 24 * 60);
      const duration = minutesBetween(drag.originalStart, drag.originalEnd);

      if (drag.mode === "move") {
        const endMoved = addMinutes(startMoved, duration);
        setDrag((previous) => (previous ? { ...previous, currentStart: startMoved, currentEnd: endMoved } : null));
      } else {
        const resizedEnd = addMinutes(drag.originalEnd, minuteDelta + dayDelta * 24 * 60);
        const minEnd = addMinutes(drag.originalStart, SNAP_MINUTES);
        const safeEnd = resizedEnd < minEnd ? minEnd : resizedEnd;
        setDrag((previous) => (previous ? { ...previous, currentStart: previous.originalStart, currentEnd: safeEnd } : null));
      }
    };

    const onUp = () => {
      if (drag) void persistDrag(drag);
      setDrag(null);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp, { once: true });

    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [drag, days.length]);

  const persistDrag = useCallback(
    async (activeDrag: DragState) => {
      if (!canModify) return;
      const changedEvent = eventItems.find((event) => event.id === activeDrag.eventId);
      if (!changedEvent) return;

      const moved =
        changedEvent.start.getTime() !== activeDrag.currentStart.getTime() ||
        changedEvent.end.getTime() !== activeDrag.currentEnd.getTime();

      if (!moved) return;

      setSaving(true);
      setError(null);

      try {
        if (changedEvent.kind === "appointment") {
          const response = await fetch(`/api/dashboard/appointments/${changedEvent.id}/reschedule`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              appointment_type_id: changedEvent.appointmentTypeId,
              new_slot_start_at: toIso(activeDrag.currentStart)
            })
          });
          if (!response.ok) throw new Error((await response.json()).error || "Failed to reschedule appointment");
        } else {
          const response = await fetch(`/api/dashboard/busy-blocks/${changedEvent.id}`, {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              start_at: toIso(activeDrag.currentStart),
              end_at: toIso(activeDrag.currentEnd)
            })
          });
          if (!response.ok) throw new Error((await response.json()).error || "Failed to update busy block");
        }

        await loadCalendarData();
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setSaving(false);
      }
    },
    [canModify, eventItems, loadCalendarData]
  );

  const startDrag = (eventItem: CalendarEvent, mode: "move" | "resize", pointerEvent: ReactPointerEvent<HTMLElement>) => {
    if (!canModify) return;
    if (mode === "resize" && eventItem.kind !== "busy") return;

    pointerEvent.preventDefault();
    pointerEvent.stopPropagation();

    setDrag({
      eventId: eventItem.id,
      mode,
      originY: pointerEvent.clientY,
      originX: pointerEvent.clientX,
      originalStart: eventItem.start,
      originalEnd: eventItem.end,
      currentStart: eventItem.start,
      currentEnd: eventItem.end
    });
  };

  const changeDate = (direction: "prev" | "next") => {
    const multiplier = direction === "next" ? 1 : -1;
    const next = new Date(selectedDate);
    next.setDate(next.getDate() + (view === "day" ? 1 : 7) * multiplier);
    setSelectedDate(next);
  };

  const createBusyBlock = async () => {
    if (!resourceId) {
      setError("Resource is required");
      return;
    }
    if (!newBlockStart || !newBlockEnd) {
      setError("Start and end are required");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/dashboard/busy-blocks", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          resource_id: resourceId,
          start_at: new Date(newBlockStart).toISOString(),
          end_at: new Date(newBlockEnd).toISOString(),
          reason: newBlockReason || undefined
        })
      });

      if (!response.ok) throw new Error((await response.json()).error || "Failed to create busy block");

      setNewBlockReason("");
      setNewBlockStart("");
      setNewBlockEnd("");
      await loadCalendarData();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const cancelAppointment = async (appointmentId: string) => {
    if (!canModify) return;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/dashboard/appointments/${appointmentId}/cancel`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ reason: "Canceled from dashboard calendar" })
      });
      if (!response.ok) throw new Error((await response.json()).error || "Failed to cancel appointment");
      await loadCalendarData();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const deleteBusyBlock = async (busyBlockId: string) => {
    if (!canModify) return;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/dashboard/busy-blocks/${busyBlockId}`, {
        method: "DELETE"
      });
      if (!response.ok) throw new Error((await response.json()).error || "Failed to delete busy block");
      await loadCalendarData();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const signOut = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  };

  const listStart = days[0]?.toLocaleDateString(undefined, { month: "short", day: "numeric" }) ?? "";
  const listEnd = days[days.length - 1]?.toLocaleDateString(undefined, { month: "short", day: "numeric" }) ?? "";

  return (
    <main className="dashboard-root">
      <section className="dashboard-controls">
        <div className="control-group">
          <label htmlFor="resource_id">Resource</label>
          <select id="resource_id" value={resourceId} onChange={(event) => setResourceId(event.target.value)}>
            <option value="">All resources</option>
            {resources.map((resource) => (
              <option key={resource.id} value={resource.id}>
                {resource.displayName}
              </option>
            ))}
          </select>
        </div>
        <div className="control-group inline-group">
          <button type="button" onClick={() => setView("day")} className={view === "day" ? "active" : ""}>
            Day
          </button>
          <button type="button" onClick={() => setView("week")} className={view === "week" ? "active" : ""}>
            Week
          </button>
        </div>
      </section>

      <section className="dashboard-header">
        <div>
          <h1>Team Calendar</h1>
          <p>
            {session.tenant.name} ({session.tenant.timezone}) | {listStart}
            {view === "week" ? ` - ${listEnd}` : ""}
          </p>
          <p style={{ marginTop: 6, fontSize: 13, color: "#475467" }}>
            Signed in as {session.user.name} ({session.user.role})
          </p>
        </div>
        <div className="header-actions">
          <button type="button" onClick={() => changeDate("prev")}>Previous</button>
          <button type="button" onClick={() => setSelectedDate(new Date())}>Today</button>
          <button type="button" onClick={() => changeDate("next")}>Next</button>
          <button type="button" onClick={signOut}>Sign Out</button>
        </div>
      </section>

      {error ? <div className="error-banner">{error}</div> : null}
      {loading ? <div className="status-banner">Loading calendar...</div> : null}
      {saving ? <div className="status-banner">Saving changes...</div> : null}

      <section className="calendar-layout">
        <div className="calendar-shell" ref={gridRef}>
          <div className="calendar-grid-head">
            <div className="time-col-head" />
            <div className="day-head-cols" style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}>
              {days.map((day) => (
                <div className="day-col-head" key={day.toISOString()}>
                  <span>{day.toLocaleDateString(undefined, { weekday: "short" })}</span>
                  <strong>{day.toLocaleDateString(undefined, { month: "short", day: "numeric" })}</strong>
                </div>
              ))}
            </div>
          </div>

          <div className="calendar-grid-body">
            <div className="time-col">
              {Array.from({ length: HOUR_END - HOUR_START + 1 }, (_, i) => HOUR_START + i).map((hour) => (
                <div key={hour} className="hour-label" style={{ top: (hour - HOUR_START) * 60 * MINUTE_HEIGHT - 8 }}>
                  {formatHourLabel(hour)}
                </div>
              ))}
            </div>

            <div className="day-cols" style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}>
              {days.map((day) => {
                const dayEvents = eventItems
                  .filter((item) => sameDay(item.start, day))
                  .map((item) => {
                    const dragEvent = drag && drag.eventId === item.id ? drag : null;
                    const eventStart = dragEvent ? dragEvent.currentStart : item.start;
                    const eventEnd = dragEvent ? dragEvent.currentEnd : item.end;
                    const dayStart = new Date(day);
                    dayStart.setHours(HOUR_START, 0, 0, 0);
                    const topMinutes = minutesBetween(dayStart, eventStart);
                    const durationMinutes = Math.max(SNAP_MINUTES, minutesBetween(eventStart, eventEnd));

                    return {
                      ...item,
                      top: topMinutes * MINUTE_HEIGHT,
                      height: durationMinutes * MINUTE_HEIGHT,
                      displayStart: eventStart,
                      displayEnd: eventEnd
                    };
                  });

                return (
                  <div key={day.toISOString()} className="day-col">
                    {Array.from({ length: HOUR_END - HOUR_START }, (_, i) => (
                      <div key={i} className="hour-line" style={{ top: i * 60 * MINUTE_HEIGHT }} />
                    ))}

                    {dayEvents.map((item) => (
                      <article
                        key={item.id}
                        className={`event-card ${item.kind}`}
                        style={{
                          top: item.top,
                          height: item.height,
                          backgroundColor: eventColor(item)
                        }}
                        onPointerDown={(pointerEvent) => startDrag(item, "move", pointerEvent)}
                      >
                        <header>
                          <strong>{item.title}</strong>
                          <span>
                            {item.displayStart.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} -{" "}
                            {item.displayEnd.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          </span>
                        </header>
                        {item.kind === "appointment" ? <p>Status: {item.status}</p> : <p>Source: {(item.raw as BusyBlock).source}</p>}
                        <div className="event-actions">
                          {item.kind === "appointment" ? (
                            <button type="button" disabled={!canModify} onClick={() => cancelAppointment(item.id)}>
                              Cancel
                            </button>
                          ) : (
                            <button type="button" disabled={!canModify} onClick={() => deleteBusyBlock(item.id)}>
                              Delete
                            </button>
                          )}
                        </div>
                        {item.kind === "busy" ? (
                          <div className="resize-handle" onPointerDown={(pointerEvent) => startDrag(item, "resize", pointerEvent)} />
                        ) : null}
                      </article>
                    ))}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <aside className="calendar-sidebar">
          <h2>Busy Block</h2>
          <p>Create manual time-off or break blocks.</p>

          <label htmlFor="busy_start">Start</label>
          <input
            id="busy_start"
            type="datetime-local"
            value={newBlockStart}
            onChange={(event) => setNewBlockStart(event.target.value)}
            disabled={!canModify}
          />

          <label htmlFor="busy_end">End</label>
          <input
            id="busy_end"
            type="datetime-local"
            value={newBlockEnd}
            onChange={(event) => setNewBlockEnd(event.target.value)}
            disabled={!canModify}
          />

          <label htmlFor="busy_reason">Reason</label>
          <input
            id="busy_reason"
            value={newBlockReason}
            onChange={(event) => setNewBlockReason(event.target.value)}
            placeholder="Lunch, meeting, time off"
            disabled={!canModify}
          />

          <button type="button" onClick={createBusyBlock} disabled={!canModify}>
            Create Busy Block
          </button>

          <small>{canModify ? "Drag to move appointments and busy blocks. Resize busy blocks from the handle." : "Viewer mode: read-only"}</small>
        </aside>
      </section>
    </main>
  );
}
