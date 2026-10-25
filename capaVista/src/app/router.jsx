import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { APP_ROUTES } from '../config/routes'
import { PERMISSIONS } from '../config/permissions'
import { resolvePostLoginPath } from '../config/navigationAccess'
import { useAuth } from '../hooks/useAuth'
import AccessDeniedPage from '../modules/auth/pages/AccessDeniedPage'
import LoginPage from '../modules/auth/pages/LoginPage'
import AppLayout from '../shared/components/layout/AppLayout'
import ProtectedRoute from '../shared/components/navigation/ProtectedRoute'
import RoleGuard from '../shared/components/navigation/RoleGuard'
import ModuleLoadingState from '../shared/components/navigation/ModuleLoadingState'
import { informationPageLoaders } from './informationPageLoaders'

const KanbanBoardPage = lazy(() => import('../modules/kanban/pages/KanbanBoardPage'))
const ProfilePage = lazy(informationPageLoaders[APP_ROUTES.PROFILE])
const PaymentConfirmationPage = lazy(() => import('../modules/payments/pages/PaymentConfirmationPage'))
const UserManagementPage = lazy(() => import('../modules/users/pages/UserManagementPage'))
const SupportHomePage = lazy(() => import('../modules/users/pages/SupportHomePage'))
const OrderCreatePage = lazy(() => import('../modules/orders/pages/OrderCreatePage'))
const PasswordResetPage = lazy(() => import('../modules/auth/pages/PasswordResetPage'))
const OrderHistoryPage = lazy(() => import('../modules/orderHistory/pages/OrderHistoryPage'))
const OrderHistoryDetailPage = lazy(() => import('../modules/orderHistory/pages/OrderHistoryDetailPage'))
const ProductionCalendarPage = lazy(() => import('../modules/productionCalendar/pages/ProductionCalendarPage'))
const MessageInboxPage = lazy(() => import('../modules/messages/pages/MessageInboxPage'))
const MessageDetailPage = lazy(() => import('../modules/messages/pages/MessageDetailPage'))
const MetricsPage = lazy(() => import('../modules/metrics/pages/MetricsPage'))
const DocumentsPage = lazy(informationPageLoaders[APP_ROUTES.DOCUMENTS])
const DataRequestsPage = lazy(informationPageLoaders[APP_ROUTES.DATA_REQUESTS])
const IncidentReportPage = lazy(informationPageLoaders[APP_ROUTES.INCIDENT_REPORT])

function UnknownRouteRedirect() {
  const { isAuthenticated } = useAuth()

  return <Navigate replace to={isAuthenticated ? '/' : APP_ROUTES.LOGIN} />
}

function HomeRedirect() {
  const { provider, user } = useAuth()
  const location = useLocation()
  return <Navigate replace to={resolvePostLoginPath(location.state?.returnTo, provider, user)} />
}

function UsersEntry() {
  const { provider } = useAuth()
  return <RoleGuard requiredPermission={PERMISSIONS.MANAGE_USERS_VISUALLY}>
    {provider === 'keycloak' ? <SupportHomePage /> : <UserManagementPage />}
  </RoleGuard>
}

export default function AppRouter() {
  return (
    <Suspense fallback={<ModuleLoadingState />}>
      <Routes>
        <Route path={APP_ROUTES.LOGIN} element={<LoginPage />} />
        <Route path={APP_ROUTES.PASSWORD_RESET} element={<PasswordResetPage />} />
        <Route path={APP_ROUTES.ACCESS_DENIED} element={<AccessDeniedPage />} />

        <Route element={<ProtectedRoute />}>
          <Route path="/" element={<AppLayout />}>
            <Route path="documentos" element={<DocumentsPage />} />
            <Route path="solicitudes" element={<DataRequestsPage />} />
            <Route path="reportar-incidente" element={<IncidentReportPage />} />
            <Route index element={<HomeRedirect />} />
            <Route
              path="kanban"
              element={
                <RoleGuard requiredPermission={PERMISSIONS.VIEW_KANBAN_MODULE}>
                  <KanbanBoardPage />
                </RoleGuard>
              }
            />
            <Route path="perfil" element={<RoleGuard requiredPermission={PERMISSIONS.READ_PROFILE}><ProfilePage /></RoleGuard>} />
            <Route path="mensajes" element={<RoleGuard requiredPermission={PERMISSIONS.READ_MESSAGES}><MessageInboxPage /></RoleGuard>} />
            <Route path="mensajes/:messageId" element={<RoleGuard requiredPermission={PERMISSIONS.READ_MESSAGES}><MessageDetailPage /></RoleGuard>} />
            <Route
              path="pagos"
              element={
                <RoleGuard requiredPermission={PERMISSIONS.VIEW_PAYMENTS_MODULE}>
                  <PaymentConfirmationPage />
                </RoleGuard>
              }
            />
            <Route
              path="ordenes/nuevo"
              element={
                <RoleGuard requiredPermission={PERMISSIONS.VIEW_ORDERS_MODULE}>
                  <OrderCreatePage />
                </RoleGuard>
              }
            />
            <Route path="historial-pedidos" element={<RoleGuard requiredPermission={PERMISSIONS.READ_ORDERS}><OrderHistoryPage /></RoleGuard>} />
            <Route path="historial-pedidos/:orderId" element={<RoleGuard requiredPermission={PERMISSIONS.READ_ORDERS}><OrderHistoryDetailPage /></RoleGuard>} />
            <Route
              path="calendario-produccion"
              element={
                <RoleGuard requiredPermission={PERMISSIONS.READ_CALENDAR}>
                  <ProductionCalendarPage />
                </RoleGuard>
              }
            />
            <Route path="admin" element={<Navigate replace to={APP_ROUTES.ADMIN_USERS} />} />
            <Route
              path="admin/usuarios"
              element={
                <UsersEntry />
              }
            />
            <Route path="admin/usuarios/nuevo" element={<Navigate replace to={APP_ROUTES.ADMIN_USERS} />} />
            <Route
              path="metricas"
              element={
                <RoleGuard
                  requiredPermission={PERMISSIONS.VIEW_METRICS}
                >
                  <MetricsPage />
                </RoleGuard>
              }
            />
          </Route>
        </Route>

        <Route path="*" element={<UnknownRouteRedirect />} />
      </Routes>
    </Suspense>
  );
}
