'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { useMenus } from '@/components/layout/MenuProvider';
import { useBranding } from '@/lib/hooks/useBranding';
import { buildDocumentTitle } from '@/lib/pageTitle';

// Keeps `document.title` in step with the route.
//
// Every screen showed the same "ERP Admin", so a row of open tabs was
// indistinguishable and browser history was one word repeated.
//
// Done here rather than with a `metadata` export per route because the pages are
// client components — `metadata` is a server-component API, and adding a
// `layout.tsx` beside each of the ~66 screens to carry it would be 66 files
// restating what `menu_master_t` already says. One component reads the menu the
// operator navigated from, so renaming a menu renames the tab (§4.1) and nothing
// per-page has to be kept in step (§4.10).
//
// Renders nothing; it is a side effect with a component's lifecycle.
export default function DocumentTitle() {
  const pathname = usePathname();
  const { menus } = useMenus();
  const branding = useBranding();
  const appTitle = branding.app_title || 'ERP Admin';

  useEffect(() => {
    // Writing to document.title IS the effect — there is no React state here, and
    // the server never rendered a per-route title to disagree with.
    document.title = buildDocumentTitle(pathname ?? '/', menus, appTitle);
  }, [pathname, menus, appTitle]);

  return null;
}
