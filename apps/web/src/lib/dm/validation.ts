import { z } from "zod";

export const dmPageSchema = z.object({
  conversationId: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[A-Z0-9]+$/, "Invalid conversation ID format"),
});

export type DMPageParams = z.infer<typeof dmPageSchema>;