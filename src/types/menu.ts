export interface MenuItem {
  id: number;
  menu_id: number | null;
  menu_order: number;
  menu_level: number | null;
  menu_name: string;
  url: string;
  text: string | null;
  icon: string | null;
  badge: string | null;
  display: 'Y' | 'N';
}

export interface MenuTreeNode extends MenuItem {
  children: MenuTreeNode[];
}
