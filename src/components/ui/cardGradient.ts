// Semantic color name → Tailwind gradient class pair. Used by every
// dashboard-card renderer (main /dashboard + module-specific
// dashboards) so cards stored in dashboard_card_master_t with a
// short color name render consistently.
//
// All class names are literal here — Tailwind's JIT scans this file
// and includes each combination in the emitted CSS.

export function gradient(color: string | null | undefined): string {
  switch ((color ?? '').toLowerCase()) {
    case 'violet':
      return 'from-violet-500 to-purple-600';
    case 'emerald':
    case 'success':
    case 'green':
      return 'from-emerald-500 to-green-600';
    case 'sky':
    case 'info':
      return 'from-sky-500 to-blue-600';
    case 'amber':
    case 'warning':
      return 'from-amber-500 to-orange-500';
    case 'rose':
    case 'danger':
      return 'from-rose-500 to-red-600';
    case 'teal':
      return 'from-teal-500 to-cyan-600';
    case 'fuchsia':
    case 'pink':
      return 'from-fuchsia-500 to-pink-600';
    case 'lime':
      return 'from-lime-500 to-green-500';
    case 'slate':
      return 'from-slate-500 to-slate-700';
    case 'cyan':
      return 'from-cyan-500 to-sky-600';
    case 'yellow':
      return 'from-yellow-500 to-amber-500';
    case 'red':
      return 'from-red-500 to-rose-600';
    case 'orange':
      return 'from-orange-500 to-amber-600';
    case 'purple':
      return 'from-purple-500 to-fuchsia-600';
    case 'primary':
    default:
      return 'from-primary-500 to-blue-600';
  }
}

// Flat-mode tile — matches main's original /dashboard styling. One
// short semantic color name maps to a solid Tailwind bg class for
// the icon square; the tile itself stays white with a light-blue
// wash so many tiles read as a coherent grid instead of a rainbow.
export function flatIconBg(color: string | null | undefined): string {
  switch ((color ?? '').toLowerCase()) {
    case 'emerald':
    case 'success':
    case 'green':
      return 'bg-emerald-500';
    case 'amber':
    case 'warning':
    case 'yellow':
    case 'orange':
      return 'bg-amber-500';
    case 'rose':
    case 'danger':
    case 'red':
      return 'bg-rose-500';
    case 'sky':
    case 'info':
    case 'cyan':
      return 'bg-sky-500';
    case 'violet':
    case 'purple':
    case 'fuchsia':
    case 'pink':
      return 'bg-violet-500';
    case 'teal':
    case 'lime':
      return 'bg-teal-500';
    case 'slate':
      return 'bg-slate-500';
    case 'primary':
    default:
      return 'bg-blue-500';
  }
}
