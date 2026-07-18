import { Shield, UserRound } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";

export function RoleSwitcher() {
  const { role, switchRole } = useAuth();
  const navigate = useNavigate();

  function handleRoleChange(nextRole) {
    switchRole(nextRole);
    navigate(nextRole === "admin" ? "/admin" : "/player");
  }

  return (
    <div className="role-switcher" aria-label="Cambiar rol mock">
      <button className={role === "player" ? "is-active" : ""} onClick={() => handleRoleChange("player")} type="button">
        <UserRound size={16} /> Jugador
      </button>
      <button className={role === "admin" ? "is-active" : ""} onClick={() => handleRoleChange("admin")} type="button">
        <Shield size={16} /> Admin
      </button>
    </div>
  );
}
