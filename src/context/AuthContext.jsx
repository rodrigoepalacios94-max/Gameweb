import { createContext, useContext, useMemo, useState } from "react";
import { authService } from "../services/authService";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [role, setRole] = useState("player");
  const [sessionVersion, setSessionVersion] = useState(0);

  const value = useMemo(() => {
    const session = authService.getInitialSession(role);
    return {
      ...session,
      switchRole: setRole,
      refreshSession: () => setSessionVersion((current) => current + 1),
    };
  }, [role, sessionVersion]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth debe utilizarse dentro de AuthProvider");
  }
  return context;
}
