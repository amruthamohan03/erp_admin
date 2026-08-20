'use client';

import { createElement } from 'react';
import * as Lucide from 'lucide-react';
import { ACTION_DEFAULTS, type ActionKey } from '@/lib/actionStyles';

// §4.26 — one icon library, resolved by name from configuration.
//
// The name comes from action_style_master_t, so an administrator changes the glyph
// for an action once and every screen follows. An unknown or mistyped name falls
// back to that action's shipped default rather than rendering nothing — a missing
// icon in a table's action column would leave an unlabelled, unclickable-looking
// button.

type IconComponent = React.ComponentType<{ className?: string }>;

const REGISTRY = Lucide as unknown as Record<string, IconComponent | undefined>;

/** Resolve a lucide name, falling back to the action's default then to a dot. */
export function resolveActionIcon(name: string | undefined, action: ActionKey): IconComponent {
  const configured = name ? REGISTRY[name] : undefined;
  if (configured) return configured;
  const fallback = REGISTRY[ACTION_DEFAULTS[action].icon];
  return fallback ?? Lucide.Circle;
}

/** True when the name maps to a real icon — used by the settings screen preview. */
export function isKnownIcon(name: string): boolean {
  return typeof REGISTRY[name] === 'function' || typeof REGISTRY[name] === 'object';
}

export default function ActionIcon({
  action,
  name,
  className = 'h-4 w-4',
}: {
  action: ActionKey;
  /** Configured icon name; omit to use the action's default. */
  name?: string;
  className?: string;
}) {
  // createElement, not <Icon />: the icon is LOOKED UP from a static registry,
  // not created here. Assigning it to a capitalised local and rendering it as JSX
  // reads to the linter as building a component during render, which would be a
  // real bug — this spelling says what is actually happening.
  return createElement(resolveActionIcon(name, action), { className });
}
