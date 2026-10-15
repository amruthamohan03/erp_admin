import { z } from 'zod';

// `?include_disabled=true` on a master's list endpoint. Off by default, so
// every dropdown reading that endpoint still sees only enabled rows
// (`display = 'Y'`); the master's own screen opts in so a disabled row can be
// switched back on. One definition, so every master parses it the same way.
export const includeDisabledParam = z
  .enum(['true', 'false'], {
    errorMap: () => ({ message: 'include_disabled must be true or false.' }),
  })
  .optional()
  .transform((v) => v === 'true');
