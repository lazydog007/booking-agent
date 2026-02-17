import { z } from "zod";

export const toolSchemas = {
  get_tenant_config: z.object({ tenant_id: z.string().uuid() }),
  get_or_create_client: z.object({
    tenant_id: z.string().uuid(),
    phone: z.string(),
    name: z.string().optional(),
    email: z.string().email().optional()
  }),
  update_client_profile: z.object({
    tenant_id: z.string().uuid(),
    client_id: z.string().uuid(),
    fields: z.record(z.string(), z.any())
  }),
  get_availability: z.object({
    tenant_id: z.string().uuid(),
    appointment_type_id: z.string().uuid(),
    resource_id: z.string().uuid().optional(),
    date_range: z.object({ start: z.string(), end: z.string() }),
    preference_window: z
      .object({
        time_of_day: z.enum(["morning", "afternoon", "evening", "any"]).optional(),
        earliest_local: z.string().optional(),
        latest_local: z.string().optional()
      })
      .optional(),
    timezone: z.string()
  }),
  create_appointment: z.object({
    tenant_id: z.string().uuid(),
    client_id: z.string().uuid(),
    appointment_type_id: z.string().uuid(),
    resource_id: z.string().uuid(),
    slot_start_at: z.string().datetime({ offset: true }),
    reason_for_appointment: z.string().optional(),
    // Legacy alias kept for backwards compatibility with older tool callers.
    reason_for_visit: z.string().optional(),
    timezone: z.string()
  }),
  create_hold: z.object({
    tenant_id: z.string().uuid(),
    client_id: z.string().uuid(),
    appointment_type_id: z.string().uuid(),
    resource_id: z.string().uuid(),
    slot_start_at: z.string().datetime({ offset: true }),
    ttl_minutes: z.number().int().positive()
  }),
  release_hold: z.object({
    tenant_id: z.string().uuid(),
    hold_appointment_id: z.string().uuid()
  }),
  reschedule_appointment: z.object({
    tenant_id: z.string().uuid(),
    appointment_id: z.string().uuid(),
    new_slot_start_at: z.string().datetime({ offset: true })
  }),
  cancel_appointment: z.object({
    tenant_id: z.string().uuid(),
    appointment_id: z.string().uuid(),
    reason: z.string().optional()
  }),
  escalate_to_human: z.object({
    tenant_id: z.string().uuid(),
    thread_id: z.string().uuid(),
    reason_code: z.string(),
    context: z.record(z.string(), z.any())
  })
};

export type ToolName = keyof typeof toolSchemas;
