import { z } from "zod";
export * from "./crypto";

export const appointmentStatusEnum = z.enum([
  "hold",
  "booked",
  "canceled",
  "completed",
  "no_show"
]);

export const userRoleEnum = z.enum(["owner", "admin", "staff", "viewer"]);

export type AppointmentStatus = z.infer<typeof appointmentStatusEnum>;
export type UserRole = z.infer<typeof userRoleEnum>;

export type RequestContext = {
  tenantId: string;
  actor: { type: "system" | "user" | "agent"; id: string };
  requestId: string;
};

export const utcIsoSchema = z.string().datetime({ offset: true });

export const availabilityQuerySchema = z.object({
  tenant_id: z.string().uuid(),
  appointment_type_id: z.string().uuid(),
  resource_id: z.string().uuid().optional(),
  date_range: z.object({
    start: z.string(),
    end: z.string()
  }),
  preference_window: z
    .object({
      time_of_day: z.enum(["morning", "afternoon", "evening", "any"]).optional(),
      earliest_local: z.string().optional(),
      latest_local: z.string().optional()
    })
    .optional(),
  client_timezone: z.string().optional()
});

export const bookingRequestSchema = z.object({
  tenant_id: z.string().uuid(),
  client: z.object({
    name: z.string().min(1),
    phone_e164: z.string().min(8),
    email: z.string().email().optional()
  }),
  appointment_type_id: z.string().uuid(),
  resource_id: z.string().uuid(),
  selected_slot: z.object({
    start_at: utcIsoSchema
  }),
  client_timezone: z.string(),
  reason_for_appointment: z.string().max(200).optional(),
  // Legacy alias kept for backwards compatibility with older clients.
  reason_for_visit: z.string().max(200).optional()
});
