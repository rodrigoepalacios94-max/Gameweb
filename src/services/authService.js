import { isSupabaseConfigured, supabase } from "../lib/supabase";
import { playerService } from "./playerService";

const ADMIN_EMAIL = import.meta.env.VITE_ADMIN_EMAIL || "";
const LEGACY_GAME_STORAGE_KEYS = [
  "game_temp_auth_session",
  "game_temp_users",
  "game_temp_admin_password",
  "game_temp_session",
];

const emptySession = {
  session: null,
  authUser: null,
  profile: null,
  role: null,
  realRole: null,
  user: null,
  adminUser: null,
  linkedPlayer: null,
  player: null,
  canUsePlayerMode: false,
  canUseAdminMode: false,
  isAuthenticated: false,
  isPlayer: false,
  isAdmin: false,
};

function buildPendingProfileSession(session) {
  const metadata = session.user?.user_metadata || {};
  const fullName = metadata.full_name || metadata.name || "";
  const [firstName = "", ...lastParts] = String(fullName).trim().split(/\s+/).filter(Boolean);
  return {
    session,
    authUser: session.user,
    profile: null,
    role: "pending_player_profile",
    user: {
      id: session.user.id,
      authUserId: session.user.id,
      email: session.user.email || "",
      firstName: metadata.first_name || metadata.given_name || firstName || "",
      lastName: metadata.last_name || metadata.family_name || lastParts.join(" ") || "",
      fullName,
      avatar: metadata.avatar_url || metadata.picture || "",
      role: "pending_player_profile",
    },
    player: null,
    isAuthenticated: true,
    isPlayer: false,
    isAdmin: false,
    needsProfileCompletion: true,
  };
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function buildAuthRedirect(path) {
  if (typeof window === "undefined" || !window.location?.origin) return path;
  return new URL(path, window.location.origin).toString();
}

function buildAdminUser(authUser, profile) {
  const metadata = authUser?.user_metadata || {};
  const fullName = String(metadata.full_name || metadata.name || "").trim();
  const [firstName = "", ...lastParts] = fullName.split(/\s+/).filter(Boolean);
  const email = authUser?.email || profile.email || "";
  const fallbackName = "Administrador";
  return {
    id: profile.id,
    authUserId: authUser.id,
    profileId: profile.id,
    email,
    firstName: metadata.first_name || metadata.given_name || firstName || fallbackName,
    lastName: metadata.last_name || metadata.family_name || lastParts.join(" ") || "",
    fullName: fullName || fallbackName || "Administrador",
    role: "admin",
    avatar: metadata.avatar_url || metadata.picture || "",
    title: "Administrador",
  };
}

function createAuthError(message, code = "AUTH_ERROR", field = null, cause = null) {
  const error = new Error(message);
  error.code = code;
  error.field = field;
  error.cause = cause;
  return error;
}

function logAuthTechnicalError(context, error) {
  if (!import.meta.env.DEV || !error) return;
  console.error(`[GAME Auth] ${context}`, {
    code: error.code || null,
    message: error.message || null,
    status: error.status || null,
    name: error.name || null,
  });
}

function ensureSupabaseConfigured() {
  if (!isSupabaseConfigured || !supabase) {
    throw createAuthError("Supabase no esta configurado. Revisa VITE_SUPABASE_URL y VITE_SUPABASE_PUBLISHABLE_KEY.", "SUPABASE_CONFIG");
  }
}

function clearLegacyTempAuthStorage() {
  if (typeof window === "undefined") return;
  LEGACY_GAME_STORAGE_KEYS.forEach((key) => window.localStorage.removeItem(key));
}

function mapSupabaseAuthError(error, context = "login") {
  const message = String(error?.message || "").toLowerCase();
  if (message.includes("email not confirmed")) {
    return createAuthError("CUENTA NO CONFIRMADA", "EMAIL_NOT_CONFIRMED", "email", error);
  }
  if (message.includes("invalid login credentials")) {
    return createAuthError(context === "admin" ? "CONTRASENA INCORRECTA" : "CONTRASEÑA INCORRECTA", "INVALID_CREDENTIALS", "password", error);
  }
  if (message.includes("user already registered") || message.includes("already registered") || message.includes("already exists")) {
    return createAuthError("YA EXISTE UNA CUENTA CON ESE CORREO", "AUTH_EMAIL_EXISTS", "email", error);
  }
  if (message.includes("session") || message.includes("expired") || message.includes("invalid token")) {
    return createAuthError("El enlace de recuperación no es válido o expiró. Pedí uno nuevo.", "AUTH_RECOVERY_LINK_INVALID", null, error);
  }
  if (message.includes("password")) {
    return createAuthError("LA CONTRASEÑA NO CUMPLE LOS REQUISITOS", "AUTH_PASSWORD_INVALID", "password", error);
  }
  return createAuthError("No pudimos completar la autenticacion.", "AUTH_PROVIDER_ERROR", null, error);
}

function getSafeAuthMessage(error) {
  if (error?.code === "ADMIN_REQUIRES_LOCK") return "UTILIZÁ EL ACCESO DE PROFESOR";
  if (error?.code === "PLAYER_REQUIRES_PLAYER_LOGIN") return "UTILIZÁ EL ACCESO DE JUGADOR";
  if (error?.code === "INVALID_CREDENTIALS") return error.message || "CONTRASEÑA INCORRECTA";
  if (error?.code === "EMAIL_NOT_CONFIRMED") return "CUENTA NO CONFIRMADA";
  if (error?.code === "PROFILE_NOT_FOUND") return "No existe un perfil GAME vinculado a este usuario.";
  if (error?.code === "PROFILE_LINK_CONFLICT") return "Existe una cuenta deportiva con este correo vinculada a otro acceso.";
  if (error?.code === "PLAYER_LINK_NOT_FOUND") return "El perfil no tiene un jugador valido vinculado.";
  if (error?.code === "AUTH_EMAIL_EXISTS") return "YA EXISTE UNA CUENTA CON ESE CORREO";
  if (error?.code === "PLAYER_DOCUMENT_EXISTS") return "EL DOCUMENTO YA ESTÁ REGISTRADO";
  if (error?.code === "PASSWORD_RESET_EMAIL_FAILED") return "NO PUDIMOS ENVIAR EL CORREO DE RECUPERACIÓN. Revisá la configuración de correo o intentá nuevamente.";
  if (error?.code === "AUTH_RECOVERY_LINK_INVALID") return error.message;
  if (error?.code === "SUPABASE_CONFIG" || error?.code === "ADMIN_EMAIL_CONFIG") return error.message;
  if (error?.message) return error.message;
  return "No pudimos iniciar sesión. Revisá tus credenciales.";
}

async function fetchProfile(authUserId, { optional = false } = {}) {
  ensureSupabaseConfigured();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, auth_user_id, email, role, player_id, created_at, updated_at")
    .eq("auth_user_id", authUserId)
    .maybeSingle();

  if (error) {
    logAuthTechnicalError("profile lookup", error);
    throw createAuthError("No pudimos cargar tu perfil de GAME.", "PROFILE_READ_FAILED", null, error);
  }
  if (!data) {
    if (optional) return null;
    throw createAuthError("No existe un perfil GAME vinculado a este usuario.", "PROFILE_NOT_FOUND");
  }
  return data;
}

async function resolveOAuthProfileIfPossible() {
  const { data, error } = await supabase.rpc("resolve_oauth_player_profile");
  if (error) {
    logAuthTechnicalError("oauth profile resolution", error);
    return { status: "needs_profile" };
  }
  return data || { status: "needs_profile" };
}

async function buildUserFromProfile(profile, authUser) {
  if (profile.role === "admin") {
    let linkedPlayer = null;
    if (profile.player_id) {
      try {
        linkedPlayer = await playerService.getPlayerById(profile.player_id);
      } catch (error) {
        logAuthTechnicalError("admin linked player lookup", error.cause || error);
      }
    }
    const adminUser = buildAdminUser(authUser, profile);
    return {
      user: {
        ...adminUser,
      },
      linkedPlayer: linkedPlayer ? {
        ...linkedPlayer,
        role: "player",
        authUserId: authUser.id,
        profileId: profile.id,
        email: linkedPlayer.email || authUser.email || profile.email,
      } : null,
    };
  }

  if (profile.role === "player") {
    if (!profile.player_id) {
      throw createAuthError("El perfil no tiene un jugador valido vinculado.", "PLAYER_LINK_NOT_FOUND");
    }
    const player = await playerService.getPlayerById(profile.player_id);
    if (!player) {
      throw createAuthError("El perfil no tiene un jugador valido vinculado.", "PLAYER_LINK_NOT_FOUND");
    }
    return {
      ...player,
      role: "player",
      authUserId: authUser.id,
      profileId: profile.id,
      email: authUser.email || profile.email || player.email,
    };
  }

  throw createAuthError("El perfil no tiene un rol valido.", "INVALID_ROLE");
}

async function resolveSession(session) {
  if (!session?.user) return emptySession;
  let profile = await fetchProfile(session.user.id, { optional: true });
  if (!profile) {
    const result = await resolveOAuthProfileIfPossible();
    if (result?.status === "conflict") {
      throw createAuthError("Existe una cuenta deportiva con este correo vinculada a otro acceso.", "PROFILE_LINK_CONFLICT", "email");
    }
    profile = await fetchProfile(session.user.id, { optional: true });
    if (!profile) return buildPendingProfileSession(session);
  }
  const user = await buildUserFromProfile(profile, session.user);
  const adminUser = profile.role === "admin" ? user.user : null;
  const linkedPlayer = profile.role === "admin" ? user.linkedPlayer : null;
  const resolvedUser = profile.role === "admin" ? adminUser : user;
  return {
    session,
    authUser: session.user,
    profile,
    role: profile.role,
    realRole: profile.role,
    user: resolvedUser,
    adminUser,
    linkedPlayer,
    player: profile.role === "player" ? resolvedUser : linkedPlayer,
    canUsePlayerMode: profile.role === "player" || Boolean(linkedPlayer),
    canUseAdminMode: profile.role === "admin",
    isAuthenticated: true,
    isPlayer: profile.role === "player",
    isAdmin: profile.role === "admin",
  };
}

async function signInWithEmail(email, password, context = "login") {
  ensureSupabaseConfigured();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: normalizeEmail(email),
    password,
  });
  if (error) throw mapSupabaseAuthError(error, context);
  clearLegacyTempAuthStorage();
  return resolveSession(data.session);
}

export const authService = {
  getAdminEmail() {
    return ADMIN_EMAIL;
  },

  getSafeAuthMessage,

  getInitialSession() {
    return emptySession;
  },

  async getCurrentSession() {
    ensureSupabaseConfigured();
    const { data, error } = await supabase.auth.getSession();
    if (error) {
      throw createAuthError("No pudimos recuperar la sesión.", "SESSION_READ_FAILED", null, error);
    }
    clearLegacyTempAuthStorage();
    return resolveSession(data.session);
  },

  async resolveAuthSession(session) {
    ensureSupabaseConfigured();
    return resolveSession(session);
  },

  async refreshCurrentProfile() {
    return this.getCurrentSession();
  },

  async signInPlayer({ email, password }) {
    const resolved = await signInWithEmail(email, password, "player");
    if (resolved.role === "admin") {
      await supabase.auth.signOut();
      throw createAuthError("UTILIZÁ EL ACCESO DE PROFESOR", "ADMIN_REQUIRES_LOCK", "email");
    }
    if (resolved.role !== "player") {
      await supabase.auth.signOut();
      throw createAuthError("No pudimos iniciar sesión como jugador.", "INVALID_PLAYER_ROLE");
    }
    return resolved;
  },

  async signInWithGoogle() {
    ensureSupabaseConfigured();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: buildAuthRedirect("/login"),
      },
    });
    if (error) throw mapSupabaseAuthError(error, "google");
    return true;
  },

  async signInAdmin({ password }) {
    ensureSupabaseConfigured();
    if (!ADMIN_EMAIL) throw createAuthError("Falta configurar VITE_ADMIN_EMAIL.", "ADMIN_EMAIL_CONFIG");
    const resolved = await signInWithEmail(ADMIN_EMAIL, password, "admin");
    if (resolved.role !== "admin") {
      await supabase.auth.signOut();
      throw createAuthError("UTILIZÁ EL ACCESO DE JUGADOR", "PLAYER_REQUIRES_PLAYER_LOGIN");
    }
    return resolved;
  },

  async registerPlayer(payload) {
    ensureSupabaseConfigured();
    const email = normalizeEmail(payload.email);
    const { data: uniqueness, error: uniquenessError } = await supabase.rpc("check_signup_uniqueness", {
      p_email: email,
      p_document: String(payload.document || "").trim() || null,
    });
    if (uniquenessError) {
      logAuthTechnicalError("signup uniqueness check", uniquenessError);
      throw createAuthError("No pudimos validar los datos de registro.", "SIGNUP_CHECK_FAILED", null, uniquenessError);
    }
    if (uniqueness?.emailExists) {
      throw createAuthError("YA EXISTE UNA CUENTA CON ESE CORREO", "AUTH_EMAIL_EXISTS", "email");
    }
    if (uniqueness?.documentExists) {
      throw createAuthError("EL DOCUMENTO YA ESTÁ REGISTRADO", "PLAYER_DOCUMENT_EXISTS", "document");
    }
    const redirectTo = buildAuthRedirect("/login");
    const { data, error } = await supabase.auth.signUp({
      email,
      password: payload.password,
      options: {
        emailRedirectTo: redirectTo,
        data: {
          game_role: "player",
          first_name: String(payload.firstName || "").trim(),
          last_name: String(payload.lastName || "").trim(),
          document: String(payload.document || "").trim() || null,
          address: String(payload.address || "").trim() || null,
          phone: String(payload.phone || "").trim() || null,
          birth_date: payload.birthDate || null,
          gender: payload.gender || null,
          category_id: payload.categoryId,
        },
      },
    });

    if (error) {
      const mapped = mapSupabaseAuthError(error, "register");
      if (String(error.message || "").toLowerCase().includes("document")) {
        throw createAuthError("EL DOCUMENTO YA ESTÁ REGISTRADO", "PLAYER_DOCUMENT_EXISTS", "document", error);
      }
      throw mapped;
    }

    clearLegacyTempAuthStorage();
    if (data.session) return resolveSession(data.session);
    return {
      ...emptySession,
      pendingEmailConfirmation: true,
      email,
      message: "CUENTA CREADA. Revisá tu correo para confirmar tu cuenta.",
    };
  },

  async completeGooglePlayerProfile(payload) {
    ensureSupabaseConfigured();
    const { data, error } = await supabase.rpc("complete_google_player_profile", {
      p_first_name: String(payload.firstName || "").trim(),
      p_last_name: String(payload.lastName || "").trim(),
      p_document: String(payload.document || "").trim() || null,
      p_address: String(payload.address || "").trim() || null,
      p_phone: String(payload.phone || "").trim() || null,
      p_birth_date: payload.birthDate || null,
      p_gender: payload.gender || null,
      p_category_id: payload.categoryId || null,
    });
    if (error) {
      logAuthTechnicalError("complete google profile", error);
      if (String(error.message || "").includes("DOCUMENT_ALREADY_EXISTS")) {
        throw createAuthError("EL DOCUMENTO YA ESTÁ REGISTRADO", "PLAYER_DOCUMENT_EXISTS", "document", error);
      }
      if (String(error.message || "").includes("PLAYER_ALREADY_LINKED")) {
        throw createAuthError("Existe una cuenta deportiva con este correo vinculada a otro acceso.", "PROFILE_LINK_CONFLICT", "email", error);
      }
      throw createAuthError("No pudimos completar tu perfil.", "PROFILE_COMPLETION_FAILED", null, error);
    }
    clearLegacyTempAuthStorage();
    return this.getCurrentSession();
  },

  async sendPasswordResetEmail(email) {
    ensureSupabaseConfigured();
    const redirectTo = buildAuthRedirect("/reset-password");
    const { error } = await supabase.auth.resetPasswordForEmail(normalizeEmail(email), {
      redirectTo,
    });
    if (import.meta.env.DEV) {
      console.info("[GAME Auth] password reset request", { redirectTo });
    }
    if (error) {
      logAuthTechnicalError("password reset email", error);
      throw createAuthError("NO PUDIMOS ENVIAR EL CORREO DE RECUPERACIÓN. Revisá la configuración de correo o intentá nuevamente.", "PASSWORD_RESET_EMAIL_FAILED", null, error);
    }
    return true;
  },

  async updateRecoveryPassword(password) {
    ensureSupabaseConfigured();
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      logAuthTechnicalError("password reset update", error);
      throw mapSupabaseAuthError(error, "reset-update");
    }
    return true;
  },

  async signOut() {
    ensureSupabaseConfigured();
    const { error } = await supabase.auth.signOut();
    if (error) throw createAuthError("No pudimos cerrar sesión.", "SIGN_OUT_FAILED", null, error);
    clearLegacyTempAuthStorage();
    return emptySession;
  },

  onAuthStateChange(callback) {
    if (!isSupabaseConfigured || !supabase) {
      callback(emptySession);
      return () => {};
    }

    const { data } = supabase.auth.onAuthStateChange(async (event, session) => {
      try {
        if (event === "SIGNED_OUT" || !session) {
          clearLegacyTempAuthStorage();
          callback(emptySession);
          return;
        }
        if (event === "SIGNED_IN" || event === "PASSWORD_RECOVERY" || event === "TOKEN_REFRESHED" || event === "USER_UPDATED" || event === "INITIAL_SESSION") {
          callback(await resolveSession(session));
        }
      } catch (error) {
        logAuthTechnicalError("auth state change", error);
        await supabase.auth.signOut();
        callback({ ...emptySession, error: getSafeAuthMessage(error) });
      }
    });

    return () => data.subscription.unsubscribe();
  },
};
