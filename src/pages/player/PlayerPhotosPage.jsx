import { useState } from "react";
import { ExternalLink, Images } from "lucide-react";
import { Card } from "../../components/common/Card";
import { EmptyState } from "../../components/common/EmptyState";
import { ErrorState } from "../../components/common/ErrorState";
import { LoadingState } from "../../components/common/LoadingState";
import { useAsyncData } from "../../hooks/useAsyncData";
import { isSafePhotoAlbumUrl, photoAlbumService } from "../../services/photoAlbumService";

export function PlayerPhotosPage() {
  const { data: albums = [], loading, error, reload } = useAsyncData(() => photoAlbumService.getPhotoAlbums({ activeOnly: true }), []);
  const [openError, setOpenError] = useState("");

  if (loading) return <LoadingState message="Cargando fotos..." />;
  if (error) return <ErrorState title="No pudimos cargar los albumes." onRetry={reload} />;

  function validateAlbumClick(event, album) {
    setOpenError("");
    if (!isSafePhotoAlbumUrl(album.link)) {
      event.preventDefault();
      setOpenError("El link de este album no es valido.");
    }
  }

  return (
    <div className="page-stack">
      <header className="page-header page-header--wide page-header--actions">
        <div>
          <span className="eyebrow">Galeria</span>
          <h1>Fotos</h1>
          <p>Albumes publicados por el profesor para consultar sin salir de GAME.</p>
        </div>
        <Images size={28} />
      </header>

      {openError ? <div className="form-alert">{openError}</div> : null}

      {albums.length ? (
        <div className="photo-album-grid">
          {albums.map((album) => (
            <a
              key={album.id}
              className="photo-album-card"
              href={isSafePhotoAlbumUrl(album.link) ? album.link : "#"}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(event) => validateAlbumClick(event, album)}
            >
              <span className="photo-album-card__icon"><Images size={22} /></span>
              <strong>{album.name}</strong>
              <span>Abrir album <ExternalLink size={15} /></span>
            </a>
          ))}
        </div>
      ) : (
        <Card>
          <EmptyState title="Todavía no hay álbumes disponibles." description="Cuando el profesor publique fotos, van a aparecer acá." />
        </Card>
      )}
    </div>
  );
}
