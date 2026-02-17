export type ConversationState =
  | "NEW"
  | "IDENTIFY_INTENT"
  | "COLLECT_SERVICE_TYPE"
  | "COLLECT_TIME_PREF"
  | "COLLECT_PROFILE"
  | "PROPOSE_SLOTS"
  | "AWAIT_SLOT_SELECTION"
  | "CONFIRM_DETAILS"
  | "BOOKING_IN_PROGRESS"
  | "BOOKED"
  | "RESCHEDULE_FLOW"
  | "CANCEL_FLOW"
  | "ESCALATED";

export type TransitionInput = {
  state: ConversationState;
  intent?: "book" | "reschedule" | "cancel" | "unknown";
  hasServiceType?: boolean;
  hasTimePreference?: boolean;
  hasProfile?: boolean;
  selectedSlot?: boolean;
  escalate?: boolean;
};

export function nextState(input: TransitionInput): ConversationState {
  if (input.escalate) return "ESCALATED";

  switch (input.state) {
    case "NEW":
      return "IDENTIFY_INTENT";
    case "IDENTIFY_INTENT":
      if (input.intent === "reschedule") return "RESCHEDULE_FLOW";
      if (input.intent === "cancel") return "CANCEL_FLOW";
      return "COLLECT_SERVICE_TYPE";
    case "COLLECT_SERVICE_TYPE":
      return input.hasServiceType ? "COLLECT_TIME_PREF" : "COLLECT_SERVICE_TYPE";
    case "COLLECT_TIME_PREF":
      return input.hasTimePreference ? "COLLECT_PROFILE" : "COLLECT_TIME_PREF";
    case "COLLECT_PROFILE":
      return input.hasProfile ? "PROPOSE_SLOTS" : "COLLECT_PROFILE";
    case "PROPOSE_SLOTS":
      return "AWAIT_SLOT_SELECTION";
    case "AWAIT_SLOT_SELECTION":
      return input.selectedSlot ? "CONFIRM_DETAILS" : "AWAIT_SLOT_SELECTION";
    case "CONFIRM_DETAILS":
      return "BOOKING_IN_PROGRESS";
    case "BOOKING_IN_PROGRESS":
      return "BOOKED";
    default:
      return input.state;
  }
}
