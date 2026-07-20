'use client';

import {
  Activity,
  Archive,
  Boxes,
  Calendar,
  CalendarCheck,
  CalendarClock,
  CalendarPlus,
  CalendarX,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  Coins,
  DollarSign,
  FileCheck,
  FileText,
  FileX,
  Hash,
  LogIn,
  LogOut,
  Mail,
  Phone,
  Receipt,
  Send,
  ShieldAlert,
  ShieldCheck,
  Ship,
  Sunrise,
  TrendingUp,
  Truck,
  Users,
  Wallet,
  Weight,
  XCircle,
  type LucideIcon,
} from 'lucide-react';

// Registry of lucide icons referenced from dashboard_card_master_t.
// Seeded rows carry the icon *name* as a string ('Users', 'Boxes',
// etc.); the render layer looks it up here. New card icons should be
// added to this registry when their seed row is added.

const REGISTRY: Record<string, LucideIcon> = {
  Activity,
  Archive,
  Boxes,
  Calendar,
  CalendarCheck,
  CalendarClock,
  CalendarPlus,
  CalendarX,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  Coins,
  DollarSign,
  FileCheck,
  FileText,
  FileX,
  Hash,
  LogIn,
  LogOut,
  Mail,
  Phone,
  Receipt,
  Send,
  ShieldAlert,
  ShieldCheck,
  Ship,
  Sunrise,
  TrendingUp,
  Truck,
  Users,
  Wallet,
  Weight,
  XCircle,
};

interface CardIconProps {
  name: string | null | undefined;
  className?: string;
}

/**
 * Renders a lucide icon by name. Falls back to a generic FileText
 * for unknown names so the card still shows something.
 */
export default function CardIcon({ name, className }: CardIconProps) {
  const Icon = (name && REGISTRY[name]) || FileText;
  return <Icon className={className} />;
}
