import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { Button } from "../../components/common/Button";
import { Card } from "../../components/common/Card";
import { EmptyState } from "../../components/common/EmptyState";
import { ErrorState } from "../../components/common/ErrorState";
import { LoadingState } from "../../components/common/LoadingState";
import { useAsyncData } from "../../hooks/useAsyncData";
import { regulationDocumentService } from "../../services/regulationDocumentService";

export function AdminRegulationViewerPage() {
  const { id } = useParams();
  const [frameKey, setFrameKey] = useState(0);
  const [frameLoading, setFrameLoading] = useState(true);
  const [frameError, setFrameError] = useState(false);
  const { data: document, loading, error, reload } = useAsyncData(
    () => regulationDocumentService.getRegulationDocumentById(id),
    [id],
  );

  if (loading) return <LoadingState message="Cargando reglamento..." />;
  if (error) return <ErrorState title="No pudimos cargar el reglamento." onRetry={reload} />;
  if (!document) return <EmptyState title="Documento no disponible" description="El documento no existe." />;

  function retry() {
    setFrameError(false);
    setFrameLoading(true);
    setFrameKey((current) => current + 1);
  }

  return (
    <div className="page-stack">
      <Link className="back-link" to="/admin/settings/regulation">
        <ArrowLeft size={18} />
        <span>Volver</span>
      </Link>

      <header className="page-header page-header--wide">
        <span className="eyebrow">Reglamentos y formatos</span>
        <h1>{document.title}</h1>
      </header>

      <Card className="pdf-viewer-card">
        {frameLoading ? <LoadingState message="Cargando PDF..." /> : null}
        {frameError ? (
          <div className="pdf-viewer-error">
            <h2>No se pudo cargar el documento</h2>
            <div className="wizard-actions">
              <Button icon={RefreshCw} onClick={retry}>Reintentar</Button>
              <Link className="button button--ghost button--md" to="/admin/settings/regulation">
                <span>Volver</span>
              </Link>
            </div>
          </div>
        ) : null}
        <div className={frameLoading || frameError ? "pdf-viewer-shell is-hidden" : "pdf-viewer-shell"}>
          <iframe
            key={frameKey}
            title={document.title}
            src={document.fileUrl}
            onLoad={() => setFrameLoading(false)}
            onError={() => {
              setFrameLoading(false);
              setFrameError(true);
            }}
          />
        </div>
      </Card>
    </div>
  );
}
