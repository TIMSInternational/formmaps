export interface NavigationItem {
  id: string;
  name: string;
  icon: string;
  path: string;
  expanded?: boolean;
  adminOnly?: boolean;
  submenu?: {
    name: string;
    path: string;
  }[];
}

export interface SidebarData {
  logo: {
    icon: string;
    text: string;
  };
  navigation: NavigationItem[];
}
