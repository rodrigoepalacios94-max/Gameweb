import { useEffect } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { AdminLayout } from "../layouts/AdminLayout";
import { PlayerLayout } from "../layouts/PlayerLayout";
import { useAuth } from "../context/AuthContext";
import { AdminCategoriesPage } from "../pages/admin/AdminCategoriesPage";
import { AdminDashboardPage } from "../pages/admin/AdminDashboardPage";
import { AdminDisciplinePage } from "../pages/admin/AdminDisciplinePage";
import { AdminMatchesPage } from "../pages/admin/AdminMatchesPage";
import { AdminNotificationsPage } from "../pages/admin/AdminNotificationsPage";
import { AdminPhotosPage } from "../pages/admin/AdminPhotosPage";
import { AdminPlayerDetailPage } from "../pages/admin/AdminPlayerDetailPage";
import { AdminPlayersPage } from "../pages/admin/AdminPlayersPage";
import { AdminRankingPage } from "../pages/admin/AdminRankingPage";
import { AdminRegulationViewerPage } from "../pages/admin/AdminRegulationViewerPage";
import { AdminRequestsPage } from "../pages/admin/AdminRequestsPage";
import { AdminSettingsPage } from "../pages/admin/AdminSettingsPage";
import { AdminSettingsRegulationPage } from "../pages/admin/AdminSettingsRegulationPage";
import { AdminSettingsScoringPage } from "../pages/admin/AdminSettingsScoringPage";
import { AdminSettingsSecurityPage } from "../pages/admin/AdminSettingsSecurityPage";
import { AdminTournamentCreatePage } from "../pages/admin/AdminTournamentCreatePage";
import { AdminTournamentDetailPage } from "../pages/admin/AdminTournamentDetailPage";
import { AdminTournamentsPage } from "../pages/admin/AdminTournamentsPage";
import { AdminMatchDetailPage } from "../pages/admin/AdminMatchDetailPage";
import { LoginPage } from "../pages/auth/LoginPage";
import { CompleteGoogleProfilePage } from "../pages/auth/CompleteGoogleProfilePage";
import { ResetPasswordPage } from "../pages/auth/ResetPasswordPage";
import { PlayerHomePage } from "../pages/player/PlayerHomePage";
import { PlayerMatchesPage } from "../pages/player/PlayerMatchesPage";
import { PlayerMatchDetailPage } from "../pages/player/PlayerMatchDetailPage";
import { PlayerNotificationsPage } from "../pages/player/PlayerNotificationsPage";
import { PaymentReturnPage } from "../pages/player/PaymentReturnPage";
import { PlayerPhotosPage } from "../pages/player/PlayerPhotosPage";
import { PlayerProfilePage } from "../pages/player/PlayerProfilePage";
import { PlayerRankingPage } from "../pages/player/PlayerRankingPage";
import { PlayerRegulationsPage } from "../pages/player/PlayerRegulationsPage";
import { PlayerRegulationViewerPage } from "../pages/player/PlayerRegulationViewerPage";
import { PlayerTournamentDetailPage } from "../pages/player/PlayerTournamentDetailPage";
import { PlayerTournamentRegistrationPage } from "../pages/player/PlayerTournamentRegistrationPage";
import { PlayerTournamentsPage } from "../pages/player/PlayerTournamentsPage";

function HomeRedirect() {
  const { isAuthenticated, loading, role, realRole } = useAuth();
  if (loading) return null;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (role === "pending_player_profile") return <Navigate to="/complete-profile" replace />;
  return <Navigate to={realRole === "admin" ? "/admin" : "/player"} replace />;
}

function RequireRole({ role: requiredRole, children }) {
  const location = useLocation();
  const { isAuthenticated, loading, profile, realRole, role, linkedPlayer, switchRole } = useAuth();

  if (loading) return null;
  if (!isAuthenticated) return <Navigate to="/login" replace state={{ from: location }} />;
  if (role === "pending_player_profile") return <Navigate to="/complete-profile" replace />;
  const canAccessAdmin = requiredRole === "admin" && realRole === "admin";
  const canUseLinkedPlayer = realRole === "admin" && profile?.player_id && linkedPlayer;
  const canAccessPlayer = requiredRole === "player" && (realRole === "player" || canUseLinkedPlayer);
  if (!canAccessAdmin && !canAccessPlayer) return <Navigate to={realRole === "admin" ? "/admin" : "/player"} replace />;
  if (requiredRole === "player" && realRole === "admin" && role !== "player") {
    return <ActivateVisualRole role="player" switchRole={switchRole} />;
  }
  if (requiredRole === "admin" && realRole === "admin" && role !== "admin") {
    return <ActivateVisualRole role="admin" switchRole={switchRole} />;
  }
  return children;
}

function ActivateVisualRole({ role, switchRole }) {
  useEffect(() => {
    switchRole?.(role);
  }, [role, switchRole]);
  return null;
}

function PublicLogin() {
  const { isAuthenticated, loading, realRole, role } = useAuth();
  if (loading) return null;
  if (isAuthenticated && role === "pending_player_profile") return <Navigate to="/complete-profile" replace />;
  if (isAuthenticated) return <Navigate to={realRole === "admin" ? "/admin" : "/player"} replace />;
  return <LoginPage />;
}

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<HomeRedirect />} />
      <Route path="/login" element={<PublicLogin />} />
      <Route path="/complete-profile" element={<CompleteGoogleProfilePage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/payment/return" element={<RequireRole role="player"><PlayerLayout /></RequireRole>}>
        <Route index element={<PaymentReturnPage />} />
      </Route>
      <Route path="/player" element={<RequireRole role="player"><PlayerLayout /></RequireRole>}>
        <Route index element={<PlayerHomePage />} />
        <Route path="tournaments" element={<PlayerTournamentsPage />} />
        <Route path="tournaments/:id" element={<PlayerTournamentDetailPage />} />
        <Route path="tournaments/:id/register" element={<PlayerTournamentRegistrationPage />} />
        <Route path="ranking" element={<PlayerRankingPage />} />
        <Route path="matches" element={<PlayerMatchesPage />} />
        <Route path="matches/:id" element={<PlayerMatchDetailPage />} />
        <Route path="notifications" element={<PlayerNotificationsPage />} />
        <Route path="photos" element={<PlayerPhotosPage />} />
        <Route path="regulations" element={<PlayerRegulationsPage />} />
        <Route path="regulations/:id" element={<PlayerRegulationViewerPage />} />
        <Route path="profile" element={<PlayerProfilePage />} />
      </Route>
      <Route path="/admin" element={<RequireRole role="admin"><AdminLayout /></RequireRole>}>
        <Route index element={<AdminDashboardPage />} />
        <Route path="tournaments" element={<AdminTournamentsPage />} />
        <Route path="tournaments/new" element={<AdminTournamentCreatePage />} />
        <Route path="tournaments/:id" element={<AdminTournamentDetailPage />} />
        <Route path="players" element={<AdminPlayersPage />} />
        <Route path="players/:id" element={<AdminPlayerDetailPage />} />
        <Route path="ranking" element={<AdminRankingPage />} />
        <Route path="categories" element={<Navigate to="/admin/settings/categories" replace />} />
        <Route path="matches" element={<AdminMatchesPage />} />
        <Route path="matches/:id" element={<AdminMatchDetailPage />} />
        <Route path="discipline" element={<AdminDisciplinePage />} />
        <Route path="requests" element={<AdminRequestsPage />} />
        <Route path="notifications" element={<AdminNotificationsPage />} />
        <Route path="photos" element={<AdminPhotosPage />} />
        <Route path="settings" element={<AdminSettingsPage />} />
        <Route path="settings/categories" element={<AdminCategoriesPage />} />
        <Route path="settings/scoring" element={<AdminSettingsScoringPage />} />
        <Route path="settings/regulation" element={<AdminSettingsRegulationPage />} />
        <Route path="settings/regulation/documents/:id" element={<AdminRegulationViewerPage />} />
        <Route path="settings/security" element={<AdminSettingsSecurityPage />} />
      </Route>
      <Route path="*" element={<HomeRedirect />} />
    </Routes>
  );
}
