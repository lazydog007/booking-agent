import { db } from "@booking-agent/db";
import { SchedulingRepository, SchedulingService } from "@booking-agent/domain";

const repo = new SchedulingRepository(db);
export const schedulingService = new SchedulingService(repo);
