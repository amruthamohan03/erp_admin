import { AuthPayload } from '@/lib/auth';

// TODO(config): back this with the master_permission table per root CLAUDE.md §4.7.
// Until the permission master is in place, callers receive a denial — never a
// silent allow — so a forgotten check fails closed rather than opening a hole.
export async function checkPermission(
  _user: AuthPayload,
  _resource: string,
  _action: string,
): Promise<boolean> {
  return false;
}
