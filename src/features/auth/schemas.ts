import { z } from 'zod'

function isAtLeast18(dob: Date): boolean {
  const now = new Date()
  let age = now.getFullYear() - dob.getFullYear()
  const m = now.getMonth() - dob.getMonth()
  if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) {
    age -= 1
  }
  return age >= 18
}

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1, 'Password is required'),
})

export const signupSchema = z
  .object({
    email: z.string().email(),
    password: z.string().min(10, 'Password must be at least 10 characters'),
    confirmPassword: z.string(),
    displayName: z.string().max(50).optional(),
    dateOfBirth: z.string().min(1, 'Date of birth is required'),
    agreeToTerms: z.literal(true, {
      errorMap: () => ({ message: 'mustAgree' }),
    }),
    subscribeNewsletter: z.boolean().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.password !== data.confirmPassword) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'passwordMismatch',
        path: ['confirmPassword'],
      })
    }
    const dob = new Date(data.dateOfBirth)
    if (isNaN(dob.getTime()) || !isAtLeast18(dob)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'underage',
        path: ['dateOfBirth'],
      })
    }
  })

export type LoginInput = z.infer<typeof loginSchema>
export type SignupInput = z.infer<typeof signupSchema>
