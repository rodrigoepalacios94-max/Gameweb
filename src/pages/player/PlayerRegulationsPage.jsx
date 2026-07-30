import { Link } from "react-router-dom";
import { Eye, FileText } from "lucide-react";
import { Card } from "../../components/common/Card";
import { EmptyState } from "../../components/common/EmptyState";
import { ErrorState } from "../../components/common/ErrorState";
import { LoadingState } from "../../components/common/LoadingState";
import { useAsyncData } from "../../hooks/useAsyncData";
import { regulationDocumentService } from "../../services/regulationDocumentService";
import { formatDate } from "../../utils/formatters";

export function PlayerRegulationsPage() {
  const { data, loading, error, reload } = useAsyncData(async () => {
    const documents = await regulationDocumentService.getRegulationDocuments({ activeOnly: true });
    return { documents };
  }, []);

  if (loading) return <LoadingState message="Cargando reglamentos..." />;
  if (error) return <ErrorState title="No pudimos cargar reglamentos." onRetry={reload} />;

  const { documents } = data;

  return (
    <div className="page-stack">
      <header className="page-header page-header--wide">
        <span className="eyebrow">Reglamentos y formatos</span>
        <h1>Reglamentos y Formatos</h1>
        <p>Documentos oficiales del circuito GAME publicados por el profesor.</p>
      </header>

      <Card>
        <div className="section-title">
          <span>Documentos PDF</span>
          <FileText size={18} />
        </div>
        {documents.length ? (
          <div className="document-list">
            {documents.map((document) => (
              <article key={document.id} className="document-row document-row--player">
                <FileText size={22} />
                <div>
                  <strong>{document.title}</strong>
                  <span>Actualizado {formatDate(document.updatedAt.slice(0, 10))}</span>
                </div>
                <Link className="button button--outline-green button--sm" to={`/player/regulations/${document.id}`}>
                  <Eye size={16} />
                  <span>Ver</span>
                </Link>
              </article>
            ))}
          </div>
        ) : (
          <EmptyState title="NO HAY REGLAMENTOS PUBLICADOS" description="Cuando el profesor publique reglamentos en PDF, van a aparecer aca." />
        )}
      </Card>
    </div>
  );
}
