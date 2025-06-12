import { z } from 'zod';

export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6)
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6)
});

type RegisterInput = z.infer<typeof registerSchema>;
export type { RegisterInput };

type LoginInput = z.infer<typeof loginSchema>;
export type { LoginInput };
