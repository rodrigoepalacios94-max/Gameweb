import { NavLink, Outlet } from "react-router-dom";
import {
  Bell,
  ChevronDown,
  Gauge,
  Medal,
  MessageSquareWarning,
  Settings,
  ShieldAlert,
  Trophy,
  UsersRound,
} from "lucide-react";
import { Avatar } from "../components/common/Avatar";
import { RoleSwitcher } from "../components/layout/RoleSwitcher";
import { useAuth } from "../context/AuthContext";
import { useAsyncData } from "../hooks/useAsyncData";
import { notificationService } from "../services/notificationService";
import logoGame from "../assets/logo-game.png";

const adminNav = [
  { to: "/admin", label: "Inicio", icon: Gauge, end: true },
  { to: "/admin/tournaments", label: "Torneos", icon: Trophy },
  { to: "/admin/players", label: "Jugadores", icon: UsersRound },
  { to: "/admin/ranking", label: "Ranking", icon: Medal },
  { to: "/admin/discipline", label: "Disciplina", icon: ShieldAlert, badgeKey: "discipline" },
  { to: "/admin/requests", label: "Solicitudes", icon: MessageSquareWarning, badgeKey: "requests" },
  { to: "/admin/notifications", label: "Avisos", icon: Bell, badgeKey: "notifications" },
  { to: "/admin/settings", label: "Configuracion", icon: Settings },
];

export function AdminLayout() {
  const { user } = useAuth();
  const { data: sidebarCountsData } = useAsyncData(() => notificationService.getAdminSidebarCounts(), []);
  const sidebarCounts = sidebarCountsData || {};

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar app-sidebar">
        <img className="sidebar-logo" src={logoGame} alt="GAME" />
        <nav className="sidebar-nav" aria-label="Navegacion administrador">
          {adminNav.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => (isActive ? "is-active" : "")}>
              <item.icon size={19} />
              <span className="sidebar-nav-label">{item.label}</span>
              {item.badgeKey && sidebarCounts[item.badgeKey] ? <span className="sidebar-badge">{sidebarCounts[item.badgeKey]}</span> : null}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-role">
          <RoleSwitcher />
        </div>
      </aside>
      <div className="admin-main">
        <header className="topbar">
          <img className="mobile-logo" src={logoGame} alt="GAME" />
          <div className="mobile-role-switcher">
            <RoleSwitcher />
          </div>
          <div className="topbar-actions">
            <div className="topbar-user">
              <Avatar src={user.avatar} name={user.fullName} size="sm" />
              <span>{user.fullName}</span>
              <ChevronDown size={18} />
            </div>
          </div>
        </header>
        <main className="shell-content">
          <Outlet />
        </main>
        <nav className="bottom-nav admin-mobile-nav" aria-label="Navegacion administrador movil">
          {adminNav.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => (isActive ? "is-active" : "")}>
              <item.icon size={20} />
              <span>{item.label}</span>
              {item.badgeKey && sidebarCounts[item.badgeKey] ? <span className="sidebar-badge bottom-nav-badge">{sidebarCounts[item.badgeKey]}</span> : null}
            </NavLink>
          ))}
        </nav>
      </div>
    </div>
  );
}
