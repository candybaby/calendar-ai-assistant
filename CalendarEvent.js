import { z } from "zod";

const CalendarEvent = z.object({
    title: z.string(),
    startTime: z.string(),
    endTime: z.string(),
    location: z.string(),
    description: z.string()
});

export default CalendarEvent;