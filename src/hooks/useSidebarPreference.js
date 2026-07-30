import { useEffect, useState } from "react";

const STORAGE_KEY = "game.sidebar.collapsed";

export function useSidebarPreference() {
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(STORAGE_KEY) === "true";
  });

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, collapsed ? "true" : "false");
  }, [collapsed]);

  return {
    sidebarCollapsed: collapsed,
    toggleSidebar: () => setCollapsed((current) => !current),
  };
}
