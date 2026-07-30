import { supabase } from "../lib/supabase";

export const MIN_PASSWORD_LENGTH = 6;

function createPasswordError(message, field, code = "PASSWORD_ERROR") {
  const error = new Error(message);
  error.field = field;
  error.code = code;
  return error;
}

function validatePasswordForm({ currentPassword, newPassword, repeatPassword }) {
  if (!currentPassword) throw createPasswordError("COMPLETA ESTE CAMPO", "currentPassword", "EMPTY_CURRENT");
  if (!newPassword) throw createPasswordError("COMPLETA ESTE CAMPO", "newPassword", "EMPTY_NEW");
  if (!repeatPassword) throw createPasswordError("COMPLETA ESTE CAMPO", "repeatPassword", "EMPTY_REPEAT");
  if (newPassword.length < MIN_PASSWORD_LENGTH) {
    throw createPasswordError(`LA CONTRASEÑA DEBE TENER AL MENOS ${MIN_PASSWORD_LENGTH} CARACTERES`, "newPassword", "NEW_PASSWORD_SHORT");
  }
  if (newPassword !== repeatPassword) {
    throw createPasswordError("LAS CONTRASENAS NUEVAS NO COINCIDEN", "repeatPassword", "NEW_PASSWORD_MISMATCH");
  }
  if (newPassword === currentPassword) {
    throw createPasswordError("LA NUEVA CONTRASENA DEBE SER DIFERENTE DE LA ACTUAL", "newPassword", "NEW_PASSWORD_SAME");
  }
}

export const passwordService = {
  async changeCurrentUserPassword(payload) {
    validatePasswordForm(payload);

    if (!supabase) {
      throw createPasswordError("Supabase no esta configurado.", null, "SUPABASE_CONFIG");
    }

    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !sessionData.session?.user?.email) {
      throw createPasswordError("No hay una sesion Auth real activa.", null, "SESSION_MISSING");
    }

    const email = sessionData.session.user.email;
    const { error: reauthError } = await supabase.auth.signInWithPassword({ email, password: payload.currentPassword });
    if (reauthError) {
      throw createPasswordError("LA CONTRASENA ACTUAL ES INCORRECTA", "currentPassword", "CURRENT_PASSWORD_WRONG");
    }

    const { error: updateError } = await supabase.auth.updateUser({ password: payload.newPassword });
    if (updateError) {
      throw createPasswordError("No pudimos actualizar la contrasena.", null, "PASSWORD_UPDATE_FAILED");
    }

    return true;
  },
};
