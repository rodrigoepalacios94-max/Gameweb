import { lazy, Suspense, useEffect } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { StartupLoader } from "../components/common/StartupLoader";
import { useAuth } from "../context/AuthContext";

function lazyNamed(loader, exportName) {
  return lazy(() => loader().then((module) => ({ default: module[exportName] })));
}

const AdminLayout = lazyNamed(() => import("../layouts/AdminLayout"), "AdminLayout");
const PlayerLayout = lazyNamed(() => import("../layouts/PlayerLayout"), "PlayerLayout");

const LoginPage = lazyNamed(() => import("../pages/auth/LoginPage"), "LoginPage");
const CompleteGoogleProfilePage = lazyNamed(() => import("../pages/auth/CompleteGoogleProfilePage"), "CompleteGoogleProfilePage");
const ResetPasswordPage = lazyNamed(() => import("../pages/auth/ResetPasswordPage"), "ResetPasswordPage");

const PlayerHomePage = lazyNamed(() => import("../pages/player/PlayerHomePage"), "PlayerHomePage");
const PlayerTournamentsPage = lazyNamed(() => import("../pages/player/PlayerTournamentsPage"), "PlayerTournamentsPage");
const PlayerTournamentDetailPage = lazyNamed(() => import("../pages/player/PlayerTournamentDetailPage"), "PlayerTournamentDetailPage");
const PlayerTournamentRegistrationPage = lazyNamed(() => import("../pages/player/PlayerTournamentRegistrationPage"), "PlayerTournamentRegistrationPage");
const PlayerRankingPage = lazyNamed(() => import("../pages/player/PlayerRankingPage"), "PlayerRankingPage");
const PlayerMatchesPage = lazyNamed(() => import("../pages/player/PlayerMatchesPage"), "PlayerMatchesPage");
const PlayerMatchDetailPage = lazyNamed(() => import("../pages/player/PlayerMatchDetailPage"), "PlayerMatchDetailPage");
const PlayerNotificationsPage = lazyNamed(() => import("../pages/player/PlayerNotificationsPage"), "PlayerNotificationsPage");
const PaymentReturnPage = lazyNamed(() => import("../pages/player/PaymentReturnPage"), "PaymentReturnPage");
const PlayerPhotosPage = lazyNamed(() => import("../pages/player/PlayerPhotosPage"), "PlayerPhotosPage");
const PlayerProfilePage = lazyNamed(() => import("../pages/player/PlayerProfilePage"), "PlayerProfilePage");
const PlayerRegulationsPage = lazyNamed(() => import("../pages/player/PlayerRegulationsPage"), "PlayerRegulationsPage");
const PlayerRegulationViewerPage = lazyNamed(() => import("../pages/player/PlayerRegulationViewerPage"), "PlayerRegulationViewerPage");

const AdminDashboardPage = lazyNamed(() => import("../pages/admin/AdminDashboardPage"), "AdminDashboardPage");
const AdminTournamentsPage = lazyNamed(() => import("../pages/admin/AdminTournamentsPage"), "AdminTournamentsPage");
const AdminTournamentCreatePage = lazyNamed(() => import("../pages/admin/AdminTournamentCreatePage"), "AdminTournamentCreatePage");
const AdminTournamentDetailPage = lazyNamed(() => import("../pages/admin/AdminTournamentDetailPage"), "AdminTournamentDetailPage");
const AdminPlayersPage = lazyNamed(() => import("../pages/admin/AdminPlayersPage"), "AdminPlayersPage");
const AdminPlayerDetailPage = lazyNamed(() => import("../pages/admin/AdminPlayerDetailPage"), "AdminPlayerDetailPage");
const AdminRankingPage = lazyNamed(() => import("../pages/admin/AdminRankingPage"), "AdminRankingPage");
const AdminMatchesPage = lazyNamed(() => import("../pages/admin/AdminMatchesPage"), "AdminMatchesPage");
const AdminMatchDetailPage = lazyNamed(() => import("../pages/admin/AdminMatchDetailPage"), "AdminMatchDetailPage");
const AdminDisciplinePage = lazyNamed(() => import("../pages/admin/AdminDisciplinePage"), "AdminDisciplinePage");
const AdminRequestsPage = lazyNamed(() => import("../pages/admin/AdminRequestsPage"), "AdminRequestsPage");
const AdminNotificationsPage = lazyNamed(() => import("../pages/admin/AdminNotificationsPage"), "AdminNotificationsPage");
const AdminPhotosPage = lazyNamed(() => import("../pages/admin/AdminPhotosPage"), "AdminPhotosPage");
const AdminSettingsPage = lazyNamed(() => import("../pages/admin/AdminSettingsPage"), "AdminSettingsPage");
const AdminCategoriesPage = lazyNamed(() => import("../pages/admin/AdminCategoriesPage"), "AdminCategoriesPage");
const AdminSettingsScoringPage = lazyNamed(() => import("../pages/admin/AdminSettingsScoringPage"), "AdminSettingsScoringPage");
const AdminSettingsRegulationPage = lazyNamed(() => import("../pages/admin/AdminSettingsRegulationPage"), "AdminSettingsRegulationPage");
const AdminRegulationViewerPage = lazyNamed(() => import("../pages/admin/AdminRegulationViewerPage"), "AdminRegulationViewerPage");
const AdminSettingsSecurityPage = lazyNamed(() => import("../pages/admin/AdminSettingsSecurityPage"), "AdminSettingsSecurityPage");

function HomeRedirect() {
  const { isAuthenticated, loading, role, realRole } = useAuth();
  if (loading) return <StartupLoader onComplete={() => {}} />;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (role === "pending_player_profile") return <Navigate to="/complete-profile" replace />;
  return <Navigate to={realRole === "admin" ? "/admin" : "/player"} replace />;
}

function RequireRole({ role: requiredRole, children }) {
  const location = useLocation();
  const { isAuthenticated, loading, profile, realRole, role, linkedPlayer, switchRole } = useAuth();

  if (loading) return <StartupLoader onComplete={() => {}} />;
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
  const { authTransitioning, isAuthenticated, loading, realRole, role } = useAuth();
  if (loading) return <StartupLoader onComplete={() => {}} />;
  if (authTransitioning) return <LoginPage />;
  if (isAuthenticated && role === "pending_player_profile") return <Navigate to="/complete-profile" replace />;
  if (isAuthenticated) return <Navigate to={realRole === "admin" ? "/admin" : "/player"} replace />;
  return <LoginPage />;
}

export function AppRoutes() {
  return (
    <Suspense fallback={<StartupLoader onComplete={() => {}} />}>
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
    </Suspense>
  );
}
