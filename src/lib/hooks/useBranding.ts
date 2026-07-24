'use client';

import { useEffect, useState } from 'react';

// Shared app branding (project name + tagline) from application_settings.
// Used by the header and the footer so both show the same identity without
// duplicating the fetch (§4.10). Returns null until loaded.

export interface AppBranding {
  project_name: string;
  tagline: string | null;
}

export function useBranding(): AppBranding | null {
  const [branding, setBranding] = useState<AppBranding | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/v1/application-settings')
      .then((r) => r.json())
      .then((j) => {
        if (cancelled || !j.ok) return;
        setBranding({ project_name: j.data.project_name, tagline: j.data.tagline ?? null });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  return branding;
}
