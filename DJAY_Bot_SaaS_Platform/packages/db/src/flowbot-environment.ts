import { flowBusinessScheduleSchema, isWithinFlowBusinessSchedule, type FlowBusinessSchedule } from "@djay/flowbot-domain";
import { z } from "zod";

export const flowBusinessSchedulesSchema = z.array(flowBusinessScheduleSchema).max(500);

export function flowbotEnvironment(now: Date, schedulesInput: readonly FlowBusinessSchedule[]) {
  const schedules = new Map(schedulesInput.map((schedule) => [schedule.scheduleKey, schedule]));
  return {
    now: now.toISOString(),
    isBusinessOpen: (scheduleKey: string, timezone: string, instant: string) => {
      const schedule = schedules.get(scheduleKey);
      return Boolean(schedule && schedule.timezone === timezone && isWithinFlowBusinessSchedule(schedule, instant));
    },
  } as const;
}
