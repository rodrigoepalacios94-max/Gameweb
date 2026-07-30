import { auditService } from "./auditService";
import { createDataError, ensureSupabaseDataClient, logSupabaseDataError } from "./supabaseDataUtils";

const BUCKET = "regulations";
const MAX_PDF_SIZE = 15 * 1024 * 1024;
const SIGNED_URL_SECONDS = 60 * 60;

const documentSelect = `
  id,
  title,
  file_name,
  storage_path,
  mime_type,
  size_bytes,
  is_active,
  created_at,
  updated_at
`;

function validatePdfFile(file, { required = true } = {}) {
  if (!file) {
    if (required) throw createDataError("Seleccioná un archivo PDF.", { field: "file" });
    return;
  }
  if (!String(file.name || "").toLowerCase().endsWith(".pdf")) {
    throw createDataError("El archivo debe tener extension .pdf.", { field: "file" });
  }
  if (file.type && file.type !== "application/pdf") {
    throw createDataError("El archivo debe ser un PDF valido.", { field: "file" });
  }
  if (file.size > MAX_PDF_SIZE) {
    throw createDataError("El PDF supera el tamano maximo permitido.", { field: "file" });
  }
}

function safeFileName(name = "reglamento.pdf") {
  const normalized = String(name).trim().replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/-+/g, "-");
  return normalized.toLowerCase().endsWith(".pdf") ? normalized : `${normalized || "reglamento"}.pdf`;
}

function buildStoragePath(file) {
  const id = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `documents/${id}-${safeFileName(file.name)}`;
}

async function signedUrlFor(client, storagePath) {
  if (!storagePath) return "";
  const { data, error } = await client.storage.from(BUCKET).createSignedUrl(storagePath, SIGNED_URL_SECONDS);
  if (error) {
    logSupabaseDataError("regulation signed url", error);
    throw createDataError("No pudimos abrir el PDF del reglamento.", { cause: error });
  }
  return data?.signedUrl || "";
}

async function mapDocument(client, row) {
  if (!row) return null;
  return {
    id: row.id,
    title: row.title,
    fileName: row.file_name,
    fileUrl: await signedUrlFor(client, row.storage_path),
    storagePath: row.storage_path,
    mimeType: row.mime_type,
    size: Number(row.size_bytes || 0),
    active: Boolean(row.is_active),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function uploadPdf(client, file) {
  validatePdfFile(file);
  const storagePath = buildStoragePath(file);
  const { error } = await client.storage.from(BUCKET).upload(storagePath, file, {
    cacheControl: "3600",
    contentType: "application/pdf",
    upsert: false,
  });
  if (error) {
    logSupabaseDataError("regulation upload", error);
    throw createDataError("No pudimos subir el PDF.", { cause: error });
  }
  return storagePath;
}

export const regulationDocumentService = {
  async getRegulationDocuments({ activeOnly = false } = {}) {
    const client = ensureSupabaseDataClient();
    let query = client.from("regulation_documents").select(documentSelect).order("updated_at", { ascending: false });
    if (activeOnly) query = query.eq("is_active", true);
    const { data, error } = await query;
    if (error) {
      logSupabaseDataError("regulation documents list", error);
      throw createDataError("No pudimos cargar reglamentos.", { cause: error });
    }
    return Promise.all((data || []).map((row) => mapDocument(client, row)));
  },

  async getRegulationDocumentById(id, { activeOnly = false } = {}) {
    const client = ensureSupabaseDataClient();
    let query = client.from("regulation_documents").select(documentSelect).eq("id", id);
    if (activeOnly) query = query.eq("is_active", true);
    const { data, error } = await query.maybeSingle();
    if (error) {
      logSupabaseDataError("regulation document by id", error);
      throw createDataError("No pudimos cargar el reglamento.", { cause: error });
    }
    return mapDocument(client, data);
  },

  async createRegulationDocument(payload, actor = "admin-1") {
    const client = ensureSupabaseDataClient();
    const title = String(payload.title || "").trim();
    if (!title) throw createDataError("Ingresá un nombre visible.", { field: "title" });
    const storagePath = await uploadPdf(client, payload.file);
    const file = payload.file;
    const { data, error } = await client
      .from("regulation_documents")
      .insert({
        title,
        file_name: file.name,
        storage_path: storagePath,
        mime_type: file.type || "application/pdf",
        size_bytes: file.size || 0,
        is_active: payload.active ?? true,
      })
      .select(documentSelect)
      .single();
    if (error) {
      await client.storage.from(BUCKET).remove([storagePath]);
      logSupabaseDataError("regulation document create", error);
      throw createDataError("No pudimos guardar el PDF.", { cause: error });
    }
    const document = await mapDocument(client, data);
    await auditService.record({
      action: "create_regulation_document",
      entityType: "regulation_document",
      entityId: document.id,
      description: `Documento de reglamento creado: ${document.title}`,
      actor,
    });
    return document;
  },

  async updateRegulationDocument(id, updates, actor = "admin-1") {
    const client = ensureSupabaseDataClient();
    const mapped = {};
    if ("title" in updates) {
      const title = String(updates.title || "").trim();
      if (!title) throw createDataError("Ingresá un nombre visible.", { field: "title" });
      mapped.title = title;
    }
    if ("active" in updates) mapped.is_active = Boolean(updates.active);
    const { data, error } = await client.from("regulation_documents").update(mapped).eq("id", id).select(documentSelect).single();
    if (error) {
      logSupabaseDataError("regulation document update", error);
      throw createDataError("No pudimos actualizar el reglamento.", { cause: error });
    }
    const document = await mapDocument(client, data);
    await auditService.record({
      action: "update_regulation_document",
      entityType: "regulation_document",
      entityId: id,
      description: "Documento de reglamento actualizado.",
      actor,
    });
    return document;
  },

  async replaceRegulationDocumentFile(id, payload, actor = "admin-1") {
    const client = ensureSupabaseDataClient();
    const current = await this.getRegulationDocumentById(id);
    if (!current) throw createDataError("No encontramos el reglamento.", { code: "REGULATION_DOCUMENT_NOT_FOUND" });
    const storagePath = await uploadPdf(client, payload.file);
    const file = payload.file;
    const { data, error } = await client
      .from("regulation_documents")
      .update({
        file_name: file.name,
        storage_path: storagePath,
        mime_type: file.type || "application/pdf",
        size_bytes: file.size || 0,
      })
      .eq("id", id)
      .select(documentSelect)
      .single();
    if (error) {
      await client.storage.from(BUCKET).remove([storagePath]);
      logSupabaseDataError("regulation document replace", error);
      throw createDataError("No pudimos reemplazar el PDF.", { cause: error });
    }
    if (current.storagePath) await client.storage.from(BUCKET).remove([current.storagePath]);
    const document = await mapDocument(client, data);
    await auditService.record({
      action: "replace_regulation_document_file",
      entityType: "regulation_document",
      entityId: id,
      description: "Archivo PDF de reglamento reemplazado.",
      actor,
    });
    return document;
  },

  async deleteRegulationDocument(id, actor = "admin-1") {
    const client = ensureSupabaseDataClient();
    const current = await this.getRegulationDocumentById(id);
    if (!current) return null;
    const { error } = await client.from("regulation_documents").delete().eq("id", id);
    if (error) {
      logSupabaseDataError("regulation document delete", error);
      throw createDataError("No pudimos eliminar el reglamento.", { cause: error });
    }
    if (current.storagePath) await client.storage.from(BUCKET).remove([current.storagePath]);
    await auditService.record({
      action: "delete_regulation_document",
      entityType: "regulation_document",
      entityId: id,
      description: `Documento de reglamento eliminado: ${current.title}`,
      actor,
    });
    return current;
  },
};
