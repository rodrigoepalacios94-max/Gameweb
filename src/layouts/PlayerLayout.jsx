import { NavLink, Outlet } from "react-router-dom";
import { Bell, CalendarCheck, ChevronDown, Home, Medal, Trophy, UserRound } from "lucide-react";
import { Avatar } from "../components/common/Avatar";
import { RoleSwitcher } from "../components/layout/RoleSwitcher";
import { useAuth } from "../context/AuthContext";
import { notificationService } from "../services/notificationService";
import logoGame from "../assets/logo-game.png";

const playerNav = [
  { to: "/player", label: "Inicio", icon: Home, end: true },
  { to: "/player/tournaments", label: "Torneos", icon: Trophy },
  { to: "/player/ranking", label: "Ranking", icon: Medal },
  { to: "/player/matches", label: "Partidos", icon: CalendarCheck },
  { to: "/player/notifications", label: "Avisos", icon: Bell },
  { to: "/player/profile", label: "Perfil", icon: UserRound },
];

export function PlayerLayout() {
  const { user } = useAuth();
  const unreadCount = notificationService.getNotificationsByRole("player").filter((item) => !item.read).length;

  return (
    <div className="app-shell player-shell">
      <aside className="desktop-nav app-sidebar">
        <img className="sidebar-logo" src={logoGame} alt="GAME" />
        <nav className="sidebar-nav" aria-label="Navegacion jugador escritorio">
          {playerNav.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => (isActive ? "is-active" : "")}>
              <item.icon size={20} />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-role">
          <RoleSwitcher />
        </div>
        <div className="sidebar-tagline">
          <strong>GAME</strong>
          <span>compite. juega. crece.</span>
        </div>
      </aside>
      <header className="topbar">
        <img className="mobile-logo" src={logoGame} alt="GAME" />
        <div className="mobile-role-switcher">
          <RoleSwitcher />
        </div>
        <div className="topbar-actions">
          <NavLink className="notification-button" to="/player/notifications" aria-label="Notificaciones">
            <Bell size={21} />
            {unreadCount ? <span /> : null}
          </NavLink>
          <div className="topbar-user">
            <Avatar src={user.avatar} name={user.fullName} size="sm" />
            <span>{user.firstName}</span>
            <ChevronDown size={18} />
          </div>
        </div>
      </header>
      <main className="shell-content">
        <Outlet />
      </main>
      <nav className="bottom-nav" aria-label="Navegacion jugador">
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
