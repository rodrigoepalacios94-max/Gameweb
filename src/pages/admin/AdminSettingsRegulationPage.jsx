import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Edit3, Eye, FileText, Trash2, Upload } from "lucide-react";
import { Badge } from "../../components/common/Badge";
import { Button } from "../../components/common/Button";
import { Card } from "../../components/common/Card";
import { ConfirmModal } from "../../components/common/ConfirmModal";
import { EmptyState } from "../../components/common/EmptyState";
import { ErrorState } from "../../components/common/ErrorState";
import { LoadingState } from "../../components/common/LoadingState";
import { Modal } from "../../components/common/Modal";
import { useAsyncData } from "../../hooks/useAsyncData";
import { regulationDocumentService } from "../../services/regulationDocumentService";
import { formatDate } from "../../utils/formatters";

const MAX_PDF_SIZE = 15 * 1024 * 1024;

export function AdminSettingsRegulationPage() {
  const [documentForm, setDocumentForm] = useState(null);
  const [deleteDocument, setDeleteDocument] = useState(null);
  const { data, loading, error, reload } = useAsyncData(async () => {
    const documents = await regulationDocumentService.getRegulationDocuments();
    return { documents };
  }, []);

  if (loading) return <LoadingState message="Cargando reglamentos..." />;
  if (error) return <ErrorState title="No pudimos cargar reglamentos." onRetry={reload} />;

  const { documents } = data;

  function openDocumentForm(document = null, mode = "create") {
    setDocumentForm({
      id: document?.id || null,
      mode,
      title: document?.title || "",
      fileName: document?.fileName || "",
      file: null,
      error: "",
    });
  }

  function validateSelectedPdf(file, required = true) {
    if (!file) return required ? "Seleccioná un archivo PDF." : "";
    if (!file.name.toLowerCase().endsWith(".pdf")) return "El archivo debe tener extension .pdf.";
    if (file.type && file.type !== "application/pdf") return "El archivo debe ser un PDF valido.";
    if (file.size > MAX_PDF_SIZE) return "El PDF supera el tamano maximo permitido.";
    return "";
  }

  async function saveDocument(event) {
    event.preventDefault();
    const title = documentForm.title.trim();
    const needsFile = documentForm.mode === "create" || documentForm.mode === "replace";
    const validationError = documentForm.mode !== "replace" && !title
      ? "Ingresá un nombre visible."
      : validateSelectedPdf(documentForm.file, needsFile);
    if (validationError) {
      setDocumentForm((current) => ({ ...current, error: validationError }));
      return;
    }
    try {
      if (documentForm.mode === "create") {
        await regulationDocumentService.createRegulationDocument({ title, file: documentForm.file });
      } else if (documentForm.mode === "edit") {
        await regulationDocumentService.updateRegulationDocument(documentForm.id, { title });
      } else if (documentForm.mode === "replace") {
        await regulationDocumentService.replaceRegulationDocumentFile(documentForm.id, { file: documentForm.file });
      }
      setDocumentForm(null);
      reload();
    } catch (error) {
      setDocumentForm((current) => ({ ...current, error: error.cause?.message || error.message || "No pudimos guardar el PDF." }));
    }
  }

  async function confirmDeleteDocument() {
    await regulationDocumentService.deleteRegulationDocument(deleteDocument.id);
    setDeleteDocument(null);
    reload();
  }

  return (
    <div className="page-stack">
      <Link className="back-link" to="/admin/settings">
        <ArrowLeft size={18} />
        <span>Volver</span>
      </Link>

      <header className="page-header page-header--wide">
        <span className="eyebrow">Configuracion</span>
        <h1>Reglamentos y Formatos</h1>
        <p>Administra reglamentos, formatos y documentos PDF visibles para jugadores.</p>
      </header>

      <Card>
        <div className="section-title">
          <span>Documentos PDF</span>
          <Button size="sm" icon={Upload} onClick={() => openDocumentForm()}>Subir PDF</Button>
        </div>
        {documents.length ? (
          <div className="document-list">
            {documents.map((document) => (
              <article key={document.id} className="document-row">
                <FileText size={22} />
                <div>
                  <strong>{document.title}</strong>
                  <span>{document.fileName} / Actualizado {formatDate(document.updatedAt.slice(0, 10))}</span>
                </div>
                <Badge tone={document.active ? "success" : "neutral"}>{document.active ? "Activo" : "Inactivo"}</Badge>
                <div className="card-actions">
                  <Link className="button button--ghost button--sm" to={`/admin/settings/regulation/documents/${document.id}`}>
                    <Eye size={16} />
                    <span>Ver</span>
                  </Link>
                  <Button variant="ghost" size="sm" icon={Edit3} onClick={() => openDocumentForm(document, "edit")}>Editar</Button>
                  <Button variant="ghost" size="sm" icon={Upload} onClick={() => openDocumentForm(document, "replace")}>Reemplazar</Button>
                  <Button variant="danger" size="sm" icon={Trash2} onClick={() => setDeleteDocument(document)}>Eliminar</Button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <EmptyState title="NO HAY REGLAMENTOS PUBLICADOS" description="Subi uno o mas documentos PDF para publicarlos en el portal del jugador." />
        )}
      </Card>

      <Modal open={Boolean(documentForm)} title={documentForm?.mode === "replace" ? "Reemplazar PDF" : documentForm?.id ? "Editar documento" : "Subir PDF"} onClose={() => setDocumentForm(null)} size="lg">
        {documentForm ? (
          <form className="modal-form" onSubmit={saveDocument}>
            {documentForm.error ? <div className="form-alert">{documentForm.error}</div> : null}
            {documentForm.mode !== "replace" ? (
              <label>Titulo del documento
                <input required value={documentForm.title} onChange={(event) => setDocumentForm((current) => ({ ...current, title: event.target.value, error: "" }))} />
              </label>
            ) : (
              <div className="info-list">
                <span>Documento: {documentForm.title}</span>
                <span>Archivo actual: {documentForm.fileName}</span>
              </div>
            )}
            {documentForm.mode !== "edit" ? (
              <label>Archivo PDF
                <input
                  type="file"
                  accept="application/pdf,.pdf"
                  onChange={(event) => setDocumentForm((current) => ({ ...current, file: event.target.files?.[0] || null, error: "" }))}
                />
              </label>
            ) : (
              <p className="muted">Podes editar el nombre sin volver a subir el archivo. Usa Reemplazar para cambiar el PDF.</p>
            )}
            <div className="wizard-actions">
              <Button variant="ghost" type="button" onClick={() => setDocumentForm(null)}>Cancelar</Button>
              <Button type="submit">Guardar</Button>
            </div>
          </form>
        ) : null}
      </Modal>

      <ConfirmModal
        open={Boolean(deleteDocument)}
        title="Eliminar documento"
        message={deleteDocument ? `Seguro que queres eliminar "${deleteDocument.title}"?` : ""}
        confirmLabel="Eliminar"
        cancelLabel="Cancelar"
        onConfirm={confirmDeleteDocument}
        onCancel={() => setDeleteDocument(null)}
      />
    </div>
  );
}
