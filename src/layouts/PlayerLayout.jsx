import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { Bell, ChevronDown, Home, Images, LogOut, Medal, PanelLeftClose, PanelLeftOpen, ScrollText, Trophy, UserRound } from "lucide-react";
import { Avatar } from "../components/common/Avatar";
import { RoleSwitcher } from "../components/layout/RoleSwitcher";
import { useAuth } from "../context/AuthContext";
import { useAsyncData } from "../hooks/useAsyncData";
import { useSidebarPreference } from "../hooks/useSidebarPreference";
import { notificationService } from "../services/notificationService";
import logoGame from "../assets/logo-game.png";

const playerNav = [
  { to: "/player", label: "Inicio", icon: Home, end: true },
  { to: "/player/tournaments", label: "Torneos", icon: Trophy },
  { to: "/player/ranking", label: "Ranking", icon: Medal },
  { to: "/player/photos", label: "Fotos", icon: Images },
  { to: "/player/regulations", label: "Reglamentos y Formatos", icon: ScrollText },
  { to: "/player/profile", label: "Perfil", icon: UserRound },
];

function notificationBadgeLabel(count) {
  if (!count) return "";
  return count > 99 ? "99+" : String(count);
}

export function PlayerLayout() {
  const { canSwitchRole, signOut, user } = useAuth();
  const navigate = useNavigate();
  const { data: notifications = [], reload: reloadNotifications } = useAsyncData(
    () => notificationService.getNotificationsByRole("player"),
    [],
    { cacheKey: "player-layout-notifications" },
  );
  const { sidebarCollapsed, toggleSidebar } = useSidebarPreference();
  const unreadCount = (notifications || []).filter((item) => !item.read).length;
  const unreadLabel = notificationBadgeLabel(unreadCount);
  const showRoleSwitcher = canSwitchRole;

  useEffect(() => {
    function handleNotificationsUpdated(event) {
      if (!event.detail?.role || event.detail.role === "player") reloadNotifications();
    }
    window.addEventListener(notificationService.NOTIFICATIONS_UPDATED_EVENT, handleNotificationsUpdated);
    return () => window.removeEventListener(notificationService.NOTIFICATIONS_UPDATED_EVENT, handleNotificationsUpdated);
  }, [reloadNotifications]);

  async function handleSignOut() {
    await signOut();
    navigate("/login", { replace: true });
  }

  return (
    <div className={sidebarCollapsed ? "app-shell player-shell sidebar-collapsed" : "app-shell player-shell"}>
      <aside className="desktop-nav app-sidebar">
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
        <nav className="sidebar-nav" aria-label="Navegación jugador escritorio">
          {playerNav.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end} title={item.label} className={({ isActive }) => (isActive ? "is-active" : "")}>
              <item.icon size={20} />
              <span className="sidebar-nav-label">{item.label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div className="sidebar-tagline">
            <strong>GAME</strong>
            <span>compite. juega. crece.</span>
          </div>
          {showRoleSwitcher ? <RoleSwitcher compact={sidebarCollapsed} /> : null}
        </div>
      </aside>
      <header className="topbar">
        <img className="mobile-logo" src={logoGame} alt="GAME" />
        <div className="topbar-actions">
          <NavLink className="notification-button" to="/player/notifications" aria-label="Notificaciones">
            <Bell size={21} />
            {unreadLabel ? <span className="notification-button__badge">{unreadLabel}</span> : null}
          </NavLink>
          <div className="topbar-user">
            <Avatar src={user.avatar} name={user.fullName} size="sm" />
            <span>{user.firstName}</span>
            <ChevronDown size={18} />
          </div>
          <button className="notification-button" type="button" onClick={handleSignOut} aria-label="Cerrar sesión">
            <LogOut size={19} />
          </button>
        </div>
      </header>
      <main className="shell-content">
        <Outlet context={{ playerNotifications: notifications || [], reloadPlayerNotifications: reloadNotifications }} />
      </main>
        <nav className="bottom-nav" aria-label="Navegación jugador">
        {playerNav.map((item) => (
          <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => (isActive ? "is-active" : "")}>
            <item.icon size={20} />
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
