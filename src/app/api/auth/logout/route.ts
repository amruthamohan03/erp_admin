import { clearAuthCookie } from '@/lib/auth';
import { ok } from '@/lib/api';

export async function POST() {
  await clearAuthCookie();
  return ok({ message: 'Logged out' });
}
