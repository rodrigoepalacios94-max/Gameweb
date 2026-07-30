import { NavLink, Outlet, useNavigate } from "react-router-dom";
import {
  Bell,
  ChevronDown,
  Home,
  Images,
  LogOut,
  Medal,
  MessageSquareWarning,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  ShieldAlert,
  Trophy,
  UsersRound,
} from "lucide-react";
import { Avatar } from "../components/common/Avatar";
import { RoleSwitcher } from "../components/layout/RoleSwitcher";
import { useAuth } from "../context/AuthContext";
import { useAsyncData } from "../hooks/useAsyncData";
import { useSidebarPreference } from "../hooks/useSidebarPreference";
import { notificationService } from "../services/notificationService";
import logoGame from "../assets/logo-game.png";

const adminNav = [
  { to: "/admin", label: "Inicio", icon: Home, end: true },
  { to: "/admin/tournaments", label: "Torneos", icon: Trophy },
  { to: "/admin/players", label: "Jugadores", icon: UsersRound },
  { to: "/admin/ranking", label: "Ranking", icon: Medal },
  { to: "/admin/discipline", label: "Disciplina", icon: ShieldAlert, badgeKey: "discipline" },
  { to: "/admin/requests", label: "Solicitudes", icon: MessageSquareWarning, badgeKey: "requests" },
  { to: "/admin/notifications", label: "Avisos", icon: Bell, badgeKey: "notifications" },
  { to: "/admin/photos", label: "Fotos", icon: Images },
  { to: "/admin/settings", label: "Configuración", icon: Settings },
];

export function AdminLayout() {
  const { canSwitchRole, signOut, user } = useAuth();
  const navigate = useNavigate();
  const { data: sidebarCountsData } = useAsyncData(() => notificationService.getAdminSidebarCounts(), []);
  const { sidebarCollapsed, toggleSidebar } = useSidebarPreference();
  const sidebarCounts = sidebarCountsData || {};
  const showRoleSwitcher = canSwitchRole;

  async function handleSignOut() {
    await signOut();
    navigate("/login", { replace: true });
  }

  return (
    <div className={sidebarCollapsed ? "admin-shell sidebar-collapsed" : "admin-shell"}>
      <aside className="admin-sidebar app-sidebar">
        {sidebarCollapsed ? (
          <button className="sidebar-expand-button" type="button" onClick={toggleSidebar} aria-label="Expandir menu" title="Expandir menu">
            <PanelLeftOpen size={16} />
          </button>
        ) : (
          <button className="sidebar-collapse-button" type="button" onClick={toggleSidebar} aria-label="Contraer menu" title="Contraer menu">
            <PanelLeftClose size={19} />
          </button>
        )}
        <img className="sidebar-logo" src={logoGame} alt="GAME" />
        <nav className="sidebar-nav" aria-label="Navegación administrador">
          {adminNav.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end} title={item.label} className={({ isActive }) => (isActive ? "is-active" : "")}>
              <item.icon size={19} />
              <span className="sidebar-nav-label">{item.label}</span>
              {item.badgeKey && sidebarCounts[item.badgeKey] ? <span className="sidebar-badge">{sidebarCounts[item.badgeKey]}</span> : null}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div className="sidebar-tagline">
            <strong>GAME</strong>
            <span>gestiona. controla. crece.</span>
          </div>
          {showRoleSwitcher ? <RoleSwitcher compact={sidebarCollapsed} /> : null}
        </div>
      </aside>
      <div className="admin-main">
        <header className="topbar">
          <img className="mobile-logo" src={logoGame} alt="GAME" />
          <div className="topbar-actions">
            <div className="topbar-user">
              <Avatar src={user.avatar} name={user.fullName} size="sm" />
              <span>{user.fullName}</span>
              <ChevronDown size={18} />
            </div>
            <button className="notification-button" type="button" onClick={handleSignOut} aria-label="Cerrar sesión">
              <LogOut size={19} />
            </button>
          </div>
        </header>
        <main className="shell-content">
          <Outlet />
        </main>
        <nav className="bottom-nav admin-mobile-nav" aria-label="Navegación administrador móvil">
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
