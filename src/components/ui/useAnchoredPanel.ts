'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

// The dropdown panel mechanics every picker shares (§4.10): measure the
// trigger, decide whether the panel fits below or has to open upward, keep it
// pinned while anything scrolls, and dismiss it on a click outside.
//
// The panel renders in a portal on `position: fixed`, not as an absolutely
// positioned child. An in-flow panel is clipped by the first ancestor with a
// clipping overflow, and pickers sit inside three of them: the transaction
// Accordion card (`overflow-hidden`), every list page's `overflow-x-auto` table
// wrapper, and the modals. Portalling fixes all of them in one place rather than
// asking each call site to relax its overflow.

const TRIGGER_GAP_PX = 4;
const VIEWPORT_PAD_PX = 8;
const MIN_PANEL_WIDTH_PX = 192;

export interface PanelPosition {
  left: number;
  width: number;
  /** Exactly one of top/bottom is set — `bottom` anchors a panel that opens upward. */
  top: number | null;
  bottom: number | null;
  /** Height the scrolling list may take. */
  maxList: number;
}

export interface AnchoredPanelOptions {
  open: boolean;
  /** Called on a click outside both the trigger and the panel. */
  onDismiss: () => void;
  /** Rows the list shows before it scrolls, and the height of one row. */
  maxRows?: number;
  minRows?: number;
  rowPx?: number;
  /** Fixed chrome above the list (search box, select-all row). */
  headerPx?: number;
}

export function useAnchoredPanel({
  open,
  onDismiss,
  maxRows = 10,
  minRows = 3,
  rowPx = 32,
  headerPx = 56,
}: AnchoredPanelOptions) {
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<PanelPosition | null>(null);
  // Read at event time, so a caller passing an inline arrow does not re-bind
  // the document listener on every render.
  const dismissRef = useRef(onDismiss);
  useEffect(() => {
    dismissRef.current = onDismiss;
  }, [onDismiss]);

  // Called before the panel is first shown (so it never paints in the wrong
  // place) and again on scroll or resize, since a fixed panel does not follow
  // its trigger on its own.
  const place = useCallback(() => {
    const trigger = rootRef.current;
    if (!trigger) return;
    const r = trigger.getBoundingClientRect();

    const wanted = maxRows * rowPx;
    const below = window.innerHeight - r.bottom - TRIGGER_GAP_PX - VIEWPORT_PAD_PX;
    const above = r.top - TRIGGER_GAP_PX - VIEWPORT_PAD_PX;
    // Flip upward only when below genuinely can't hold the panel *and* above is
    // roomier — flipping into an equally cramped space just moves the problem.
    const flip = below < wanted + headerPx && above > below;
    const room = (flip ? above : below) - headerPx;

    // A very narrow trigger still needs a readable list, so the panel has a
    // floor. When that floor makes it WIDER than the trigger it grows leftward —
    // right is where the next field in a grid form sits.
    const width = Math.round(Math.max(r.width, MIN_PANEL_WIDTH_PX));
    const preferred = width > r.width ? r.right - width : r.left;
    // Then keep it on screen.
    const maxLeft = window.innerWidth - width - VIEWPORT_PAD_PX;
    const left = Math.round(Math.min(Math.max(preferred, VIEWPORT_PAD_PX), Math.max(maxLeft, VIEWPORT_PAD_PX)));

    setPosition({
      left,
      width,
      top: flip ? null : Math.round(r.bottom + TRIGGER_GAP_PX),
      bottom: flip ? Math.round(window.innerHeight - r.top + TRIGGER_GAP_PX) : null,
      maxList: Math.round(Math.max(minRows * rowPx, Math.min(wanted, room))),
    });
  }, [maxRows, minRows, rowPx, headerPx]);

  // Close on outside click. The panel lives in a portal, so it is not inside
  // rootRef — both subtrees have to count as "inside".
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      const target = e.target as Node;
      if (rootRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      dismissRef.current();
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  // Keep the panel pinned to its trigger while the page or any scroll container
  // moves — `true` catches scrolls on nested containers, which don't bubble.
  useEffect(() => {
    if (!open) return;
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, [open, place]);

  return { rootRef, panelRef, position, place };
}
