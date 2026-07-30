import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { authService } from "../services/authService";

export const AUTH_SUCCESS_ANIMATION_MS = 3000;
const AuthContext = createContext(null);

function wait(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function getInitialState() {
  return {
    ...authService.getInitialSession(),
    activeRole: null,
    loading: true,
    authLoading: false,
    authTransitioning: false,
    error: "",
  };
}

export function AuthProvider({ children }) {
  const [state, setState] = useState(getInitialState);

  const applySession = useCallback((sessionState) => {
    setState((current) => {
      const nextActiveRole = sessionState.realRole === "admin" && current.activeRole === "player" && sessionState.linkedPlayer
        ? "player"
        : sessionState.role || null;
      const nextUser = nextActiveRole === "player" && sessionState.linkedPlayer
        ? sessionState.linkedPlayer
        : sessionState.user;
      return {
        ...current,
        ...sessionState,
        activeRole: nextActiveRole,
        role: nextActiveRole || sessionState.role,
        user: nextUser,
        player: nextActiveRole === "player" ? (sessionState.linkedPlayer || sessionState.player) : sessionState.player,
        loading: false,
        authLoading: false,
        authTransitioning: false,
        error: sessionState.error || "",
      };
    });
  }, []);

  const runSuccessfulAuthTransition = useCallback(async (action) => {
    const sessionState = await action();
    setState((current) => ({
      ...current,
      authLoading: false,
      authTransitioning: true,
      error: "",
    }));
    await wait(AUTH_SUCCESS_ANIMATION_MS);
    applySession(sessionState);
    return sessionState;
  }, [applySession]);

  useEffect(() => {
    let active = true;

    async function recoverSession() {
      try {
        const sessionState = await authService.getCurrentSession();
        if (active) applySession(sessionState);
      } catch (error) {
        if (active) {
          applySession({
            ...authService.getInitialSession(),
            error: authService.getSafeAuthMessage(error),
          });
        }
      }
    }

    recoverSession();

    const unsubscribe = authService.onAuthStateChange((sessionState) => {
      if (!active) return;
      applySession(sessionState);
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [applySession]);

  const signInPlayer = useCallback(async (credentials) => {
    setState((current) => ({ ...current, authLoading: true, error: "" }));
    try {
      return await runSuccessfulAuthTransition(() => authService.signInPlayer(credentials));
    } catch (error) {
      const message = authService.getSafeAuthMessage(error);
      setState((current) => ({ ...current, authLoading: false, authTransitioning: false, error: message }));
      const uiError = new Error(message);
      uiError.field = error.field;
      uiError.code = error.code;
      throw uiError;
    }
  }, [runSuccessfulAuthTransition]);

  const signInAdmin = useCallback(async ({ password }) => {
    setState((current) => ({ ...current, authLoading: true, error: "" }));
    try {
      return await runSuccessfulAuthTransition(() => authService.signInAdmin({ password }));
    } catch (error) {
      const message = authService.getSafeAuthMessage(error);
      setState((current) => ({ ...current, authLoading: false, authTransitioning: false, error: message }));
      const uiError = new Error(message);
      uiError.field = error.field;
      uiError.code = error.code;
      throw uiError;
    }
  }, [runSuccessfulAuthTransition]);

  const registerPlayer = useCallback(async (payload) => {
    setState((current) => ({ ...current, authLoading: true, error: "" }));
    try {
      const sessionState = await authService.registerPlayer(payload);
      if (sessionState.pendingEmailConfirmation) {
        setState((current) => ({ ...current, authLoading: false, authTransitioning: false, error: "" }));
        return sessionState;
      }
      return await runSuccessfulAuthTransition(() => Promise.resolve(sessionState));
    } catch (error) {
      const message = error.message || authService.getSafeAuthMessage(error);
      setState((current) => ({ ...current, authLoading: false, authTransitioning: false, error: message }));
      const uiError = new Error(message);
      uiError.field = error.field;
      uiError.code = error.code;
      throw uiError;
    }
  }, [runSuccessfulAuthTransition]);

  const signInWithGoogle = useCallback(async () => {
    setState((current) => ({ ...current, authLoading: true, error: "" }));
    try {
      return await authService.signInWithGoogle();
    } catch (error) {
      const message = authService.getSafeAuthMessage(error);
      setState((current) => ({ ...current, authLoading: false, authTransitioning: false, error: message }));
      throw new Error(message);
    }
  }, []);

  const completeGooglePlayerProfile = useCallback(async (payload) => {
    setState((current) => ({ ...current, authLoading: true, error: "" }));
    try {
      return await runSuccessfulAuthTransition(() => authService.completeGooglePlayerProfile(payload));
    } catch (error) {
      const message = authService.getSafeAuthMessage(error);
      setState((current) => ({ ...current, authLoading: false, authTransitioning: false, error: message }));
      const uiError = new Error(message);
      uiError.field = error.field;
      uiError.code = error.code;
      throw uiError;
    }
  }, [runSuccessfulAuthTransition]);

  const signOut = useCallback(async () => {
    setState((current) => ({ ...current, authLoading: true, error: "" }));
    try {
      const sessionState = await authService.signOut();
      applySession({ ...sessionState, activeRole: null });
      return sessionState;
    } catch (error) {
      const message = authService.getSafeAuthMessage(error);
      setState((current) => ({ ...current, error: message }));
      throw new Error(message);
    } finally {
      setState((current) => ({ ...current, authLoading: false, authTransitioning: false }));
    }
  }, [applySession]);

  const refreshProfile = useCallback(async () => {
    setState((current) => ({ ...current, loading: true, error: "" }));
    try {
      const sessionState = await authService.refreshCurrentProfile();
      applySession(sessionState);
      return sessionState;
    } catch (error) {
      const message = authService.getSafeAuthMessage(error);
      applySession({ ...authService.getInitialSession(), error: message });
      throw new Error(message);
    }
  }, [applySession]);

  const switchRole = useCallback((nextRole) => {
    setState((current) => {
      if (nextRole === "admin" && current.realRole === "admin") {
        return { ...current, activeRole: "admin", role: "admin", user: current.adminUser || current.user };
      }
      if (nextRole === "player" && current.linkedPlayer) {
        return { ...current, activeRole: "player", role: "player", user: current.linkedPlayer, player: current.linkedPlayer };
      }
      if (nextRole === "player" && current.realRole === "player") {
        return { ...current, activeRole: "player", role: "player" };
      }
      return current;
    });
  }, []);

  const value = useMemo(() => ({
    ...state,
    isAuthenticated: Boolean(state.session && state.user),
    isPlayer: state.role === "player",
    isAdmin: state.role === "admin",
    realRole: state.realRole || state.role,
    canUsePlayerMode: Boolean(state.realRole === "player" || (state.realRole === "admin" && state.linkedPlayer)),
    canUseAdminMode: Boolean(state.realRole === "admin"),
    canSwitchRole: Boolean(state.realRole === "admin" && state.linkedPlayer),
    signInPlayer,
    signInAdmin,
    registerPlayer,
    signInWithGoogle,
    completeGooglePlayerProfile,
    signOut,
    switchRole: state.realRole === "admin" && state.linkedPlayer ? switchRole : undefined,
    refreshProfile,
    refreshSession: refreshProfile,
  }), [completeGooglePlayerProfile, refreshProfile, registerPlayer, signInAdmin, signInPlayer, signInWithGoogle, signOut, state, switchRole]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth debe utilizarse dentro de AuthProvider");
  return context;
}
