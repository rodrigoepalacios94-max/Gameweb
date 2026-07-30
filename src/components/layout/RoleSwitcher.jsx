import { Shield, UserRound } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";

export function RoleSwitcher({ compact = false }) {
  const { role, switchRole } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  if (!switchRole) return null;

  const activeRole = location.pathname.startsWith("/admin")
    ? "admin"
    : location.pathname.startsWith("/player") || location.pathname.startsWith("/payment/return")
    ? "player"
    : role;

  function handleRoleChange(nextRole) {
    switchRole(nextRole);
    navigate(nextRole === "admin" ? "/admin" : "/player");
  }

  return (
    <div className={compact ? "role-switcher role-switcher--compact" : "role-switcher"} aria-label="Cambiar modo">
      <button className={activeRole === "player" ? "is-active" : ""} onClick={() => handleRoleChange("player")} type="button" title="Jugador">
        <UserRound size={16} /> <span>JUGADOR</span>
      </button>
      <button className={activeRole === "admin" ? "is-active" : ""} onClick={() => handleRoleChange("admin")} type="button" title="Admin">
        <Shield size={16} /> <span>ADMIN</span>
      </button>
    </div>
  );
}
