import OpenAI from "openai";
import { SYSTEM_PROMPT } from "./prompt/system-prompt";
import type { ToolName } from "./tools/tool-schemas";

type ToolExecutor = (name: ToolName, args: Record<string, unknown>) => Promise<unknown>;

export class AgentRuntime {
  private readonly client: OpenAI;

  constructor(private readonly executeTool: ToolExecutor) {
    this.client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }

  async respond(input: {
    threadId: string;
    tenantId: string;
    userText: string;
    state: string;
    context: Record<string, unknown>;
  }) {
    const response = await this.client.responses.create({
      model: process.env.OPENAI_MODEL ?? "gpt-4.1-mini",
      input: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: JSON.stringify({
            tenant_id: input.tenantId,
            state: input.state,
            context: input.context,
            message: input.userText
          })
        }
      ],
      temperature: 0.1,
      tools: [
        { type: "function", name: "get_tenant_config", strict: true, parameters: { type: "object", properties: { tenant_id: { type: "string" } }, required: ["tenant_id"] } },
        { type: "function", name: "get_or_create_client", strict: true, parameters: { type: "object", properties: { tenant_id: { type: "string" }, phone: { type: "string" } }, required: ["tenant_id", "phone"] } },
        { type: "function", name: "get_availability", strict: true, parameters: { type: "object", properties: { tenant_id: { type: "string" }, appointment_type_id: { type: "string" } }, required: ["tenant_id", "appointment_type_id"] } },
        { type: "function", name: "create_appointment", strict: true, parameters: { type: "object", properties: { tenant_id: { type: "string" }, client_id: { type: "string" }, appointment_type_id: { type: "string" }, resource_id: { type: "string" }, slot_start_at: { type: "string" }, timezone: { type: "string" } }, required: ["tenant_id", "client_id", "appointment_type_id", "resource_id", "slot_start_at", "timezone"] } },
        { type: "function", name: "reschedule_appointment", strict: true, parameters: { type: "object", properties: { tenant_id: { type: "string" }, appointment_id: { type: "string" }, new_slot_start_at: { type: "string" } }, required: ["tenant_id", "appointment_id", "new_slot_start_at"] } },
        { type: "function", name: "cancel_appointment", strict: true, parameters: { type: "object", properties: { tenant_id: { type: "string" }, appointment_id: { type: "string" } }, required: ["tenant_id", "appointment_id"] } },
        { type: "function", name: "escalate_to_human", strict: true, parameters: { type: "object", properties: { tenant_id: { type: "string" }, thread_id: { type: "string" }, reason_code: { type: "string" } }, required: ["tenant_id", "thread_id", "reason_code"] } }
      ]
    });

    for (const item of response.output) {
      if (item.type === "function_call") {
        await this.executeTool(item.name as ToolName, JSON.parse(item.arguments));
      }
    }

    return response.output_text;
  }
}
