import { Navigate, Route, Routes } from "react-router-dom";
import { AdminLayout } from "../layouts/AdminLayout";
import { PlayerLayout } from "../layouts/PlayerLayout";
import { useAuth } from "../context/AuthContext";
import { AdminCategoriesPage } from "../pages/admin/AdminCategoriesPage";
import { AdminDashboardPage } from "../pages/admin/AdminDashboardPage";
import { AdminDisciplinePage } from "../pages/admin/AdminDisciplinePage";
import { AdminMatchesPage } from "../pages/admin/AdminMatchesPage";
import { AdminNotificationsPage } from "../pages/admin/AdminNotificationsPage";
import { AdminPlayerDetailPage } from "../pages/admin/AdminPlayerDetailPage";
import { AdminPlayersPage } from "../pages/admin/AdminPlayersPage";
import { AdminRankingPage } from "../pages/admin/AdminRankingPage";
import { AdminRequestsPage } from "../pages/admin/AdminRequestsPage";
import { AdminSettingsPage } from "../pages/admin/AdminSettingsPage";
import { AdminTournamentCreatePage } from "../pages/admin/AdminTournamentCreatePage";
import { AdminTournamentDetailPage } from "../pages/admin/AdminTournamentDetailPage";
import { AdminTournamentsPage } from "../pages/admin/AdminTournamentsPage";
import { AdminMatchDetailPage } from "../pages/admin/AdminMatchDetailPage";
import { PlayerHomePage } from "../pages/player/PlayerHomePage";
import { PlayerMatchesPage } from "../pages/player/PlayerMatchesPage";
import { PlayerMatchDetailPage } from "../pages/player/PlayerMatchDetailPage";
import { PlayerNotificationsPage } from "../pages/player/PlayerNotificationsPage";
import { PlayerProfilePage } from "../pages/player/PlayerProfilePage";
import { PlayerRankingPage } from "../pages/player/PlayerRankingPage";
import { PlayerTournamentDetailPage } from "../pages/player/PlayerTournamentDetailPage";
import { PlayerTournamentRegistrationPage } from "../pages/player/PlayerTournamentRegistrationPage";
import { PlayerTournamentsPage } from "../pages/player/PlayerTournamentsPage";

function HomeRedirect() {
  const { role } = useAuth();
  return <Navigate to={role === "admin" ? "/admin" : "/player"} replace />;
}

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<HomeRedirect />} />
      <Route path="/player" element={<PlayerLayout />}>
        <Route index element={<PlayerHomePage />} />
        <Route path="tournaments" element={<PlayerTournamentsPage />} />
        <Route path="tournaments/:id" element={<PlayerTournamentDetailPage />} />
        <Route path="tournaments/:id/register" element={<PlayerTournamentRegistrationPage />} />
        <Route path="ranking" element={<PlayerRankingPage />} />
        <Route path="matches" element={<PlayerMatchesPage />} />
        <Route path="matches/:id" element={<PlayerMatchDetailPage />} />
        <Route path="notifications" element={<PlayerNotificationsPage />} />
        <Route path="profile" element={<PlayerProfilePage />} />
      </Route>
      <Route path="/admin" element={<AdminLayout />}>
        <Route index element={<AdminDashboardPage />} />
        <Route path="tournaments" element={<AdminTournamentsPage />} />
        <Route path="tournaments/new" element={<AdminTournamentCreatePage />} />
        <Route path="tournaments/:id" element={<AdminTournamentDetailPage />} />
        <Route path="players" element={<AdminPlayersPage />} />
        <Route path="players/:id" element={<AdminPlayerDetailPage />} />
        <Route path="ranking" element={<AdminRankingPage />} />
        <Route path="categories" element={<AdminCategoriesPage />} />
        <Route path="matches" element={<AdminMatchesPage />} />
        <Route path="matches/:id" element={<AdminMatchDetailPage />} />
        <Route path="discipline" element={<AdminDisciplinePage />} />
        <Route path="requests" element={<AdminRequestsPage />} />
        <Route path="notifications" element={<AdminNotificationsPage />} />
        <Route path="settings" element={<AdminSettingsPage />} />
      </Route>
      <Route path="*" element={<HomeRedirect />} />
    </Routes>
  );
}
