import { createContext, useContext, useMemo, useState } from "react";
import { mockPlayers } from "../mocks/mockPlayers";

const AuthContext = createContext(null);

const mockAdmin = {
  id: "admin-1",
  firstName: "Martin",
  lastName: "Aguirre",
  fullName: "Martin Aguirre",
  role: "admin",
  avatar: "https://images.unsplash.com/photo-1556157382-97eda2d62296?auto=format&fit=crop&w=240&q=80",
  title: "Profesor principal",
};

export function AuthProvider({ children }) {
  const [role, setRole] = useState("player");
  const playerUser = mockPlayers.find((player) => player.id === "player-1");

  const value = useMemo(() => {
    const user = role === "admin" ? mockAdmin : { ...playerUser, role: "player" };
    return {
      role,
      user,
      isPlayer: role === "player",
      isAdmin: role === "admin",
      switchRole: setRole,
    };
  }, [playerUser, role]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth debe utilizarse dentro de AuthProvider");
  }
  return context;
}
