import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';

import { AuthProvider } from './context/AuthContext.jsx';
import { AppConfigProvider } from './context/AppConfigContext.jsx';
import PrivateRoute from './components/PrivateRoute.jsx';
import AppErrorBoundary from './components/AppErrorBoundary.jsx';
import AppConfigWarning from './components/AppConfigWarning.jsx';
import { isNativeRiderApp } from './lib/nativeRiderGps.js';

// Componente de carga
const PageLoader = () => (
  <div className="flex items-center justify-center min-h-screen bg-white">
    <div className="flex flex-col items-center">
      <div className="w-10 h-10 border-4 border-brand-500 border-t-transparent rounded-full animate-spin shadow-lg"></div>
      <p className="mt-6 text-gray-400 font-bold text-[10px] uppercase tracking-[0.2em] animate-pulse">
        Cargando Modo Sabor...
      </p>
    </div>
  </div>
);

/*
  WebPublica se deja como import directo a propósito: es la carta, la pantalla
  que abre el cliente con hambre, y un chunk aparte le agregaría un viaje de red
  antes de ver un plato.

  Lo que sí se difiere es todo lo del panel. `Layout` —la barra lateral, el
  encabezado, los íconos del menú de administración— viajaba en el paquete
  principal, así que cada persona que abría la carta se bajaba la interfaz
  completa del back office sin verla nunca.
*/
import WebPublica from './pages/WebPublica.jsx';

const Layout = lazy(() => import('./components/Layout.jsx'));
const ClubFidelidad = lazy(() => import('./pages/ClubFidelidad.jsx'));
const TerminosCondiciones = lazy(() => import('./pages/ClubFidelidad/TerminosCondiciones.jsx'));
const PersonalClock = lazy(() => import('./pages/PersonalClock.jsx'));

// Lazy imports
const Login = lazy(() => import('./pages/Login.jsx'));
const Dashboard = lazy(() => import('./pages/DashboardModern.jsx'));
const Operacion = lazy(() => import('./pages/Operacion.jsx'));
const TPV = lazy(() => import('./pages/TPV.jsx'));
const Pedidos = lazy(() => import('./pages/Pedidos.jsx'));
const Productos = lazy(() => import('./pages/Productos.jsx'));
const Inventario = lazy(() => import('./pages/Inventario.jsx'));
const Compras = lazy(() => import('./pages/Compras.jsx'));
const Categorias = lazy(() => import('./pages/Categorias.jsx'));
const Clientes = lazy(() => import('./pages/Clientes.jsx'));
const Delivery = lazy(() => import('./pages/Delivery.jsx'));
const Direcciones = lazy(() => import('./pages/Direcciones.jsx'));
const KDS = lazy(() => import('./pages/KDS.jsx'));
const Mesas = lazy(() => import('./pages/Mesas.jsx'));
const Caja = lazy(() => import('./pages/Caja.jsx'));
const Usuarios = lazy(() => import('./pages/Usuarios.jsx'));
const Reportes = lazy(() => import('./pages/Reportes.jsx'));
const ReportesDelivery = lazy(() => import('./pages/ReportesDelivery.jsx'));
const MarketingDigital = lazy(() => import('./pages/MarketingDigital.jsx'));
const WhatsAppCopiloto = lazy(() => import('./pages/WhatsAppCopiloto.jsx'));
const Configuracion = lazy(() => import('./pages/Configuracion.jsx'));
const Cupones = lazy(() => import('./pages/Cupones.jsx'));
const Fidelizacion = lazy(() => import('./pages/Fidelizacion.jsx'));
const Auditoria = lazy(() => import('./pages/Auditoria.jsx'));
const Cuenta = lazy(() => import('./pages/Cuenta.jsx'));
const Personal = lazy(() => import('./pages/Personal.jsx'));
const SeguimientoPedido = lazy(() => import('./pages/SeguimientoPedido.jsx'));
const RiderPanel = lazy(() => import('./pages/RiderPanel.jsx'));

export default function App() {
  return (
    <AuthProvider>
      <AppConfigProvider>
        <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <AppErrorBoundary>
            <Toaster position="top-right" toastOptions={{ duration: 3000 }} />
            <AppConfigWarning />
            <Suspense
              fallback={
                <div className="flex h-screen items-center justify-center">
                  <div className="animate-spin h-8 w-8 border-4 border-brand-500 border-t-transparent rounded-full" />
                </div>
              }
            >
              <Routes>
                <Route
                  path="/"
                  element={isNativeRiderApp() ? <Navigate to="/rider" replace /> : <WebPublica />}
                />
                <Route path="/club" element={<ClubFidelidad />} />
                <Route path="/club/terminos" element={<TerminosCondiciones />} />
                <Route path="/club/:codigo" element={<ClubFidelidad />} />
                <Route path="/personal/reloj" element={<PersonalClock />} />
                <Route path="/personal/reloj/:token" element={<PersonalClock />} />
                <Route path="/seguimiento/:id" element={<SeguimientoPedido />} />
                <Route path="/rider" element={<RiderPanel />} />
                <Route path="/rider/:id/:codigo" element={<RiderPanel />} />
                <Route path="/admin" element={<Login />} />
                <Route element={<PrivateRoute />}>
                  <Route element={<Layout />}>
                    <Route element={<PrivateRoute permission="dashboard.view" />}>
                      <Route path="/admin/dashboard" element={<Dashboard />} />
                      <Route path="/admin/operacion" element={<Operacion />} />
                    </Route>
                    <Route element={<PrivateRoute permission="tpv.use" moduleKey="tpv" />}>
                      <Route path="/admin/tpv" element={<TPV />} />
                    </Route>
                    <Route element={<PrivateRoute permission="pedidos.view" />}>
                      <Route path="/admin/pedidos" element={<Pedidos />} />
                    </Route>
                    <Route element={<PrivateRoute permission="pedidos.edit" />}>
                      <Route path="/admin/direcciones" element={<Direcciones />} />
                    </Route>
                    <Route element={<PrivateRoute permission="caja.view" moduleKey="caja" />}>
                      <Route path="/admin/caja" element={<Caja />} />
                    </Route>
                    <Route element={<PrivateRoute permission="kds.view" moduleKey="kds" />}>
                      <Route path="/admin/kds" element={<KDS />} />
                    </Route>
                    <Route element={<PrivateRoute permission="mesas.view" moduleKey="mesas" />}>
                      <Route path="/admin/mesas" element={<Mesas />} />
                    </Route>
                    <Route
                      element={<PrivateRoute permission="delivery.view" moduleKey="delivery" />}
                    >
                      <Route path="/admin/delivery" element={<Delivery />} />
                    </Route>
                    <Route element={<PrivateRoute permission="productos.edit" />}>
                      <Route path="/admin/productos" element={<Productos />} />
                      <Route path="/admin/categorias" element={<Categorias />} />
                    </Route>
                    <Route
                      element={<PrivateRoute permission="productos.edit" moduleKey="inventario" />}
                    >
                      <Route path="/admin/inventario" element={<Inventario />} />
                      <Route path="/admin/compras" element={<Compras />} />
                    </Route>
                    <Route
                      element={<PrivateRoute permission="clientes.view" moduleKey="clientes" />}
                    >
                      <Route path="/admin/clientes" element={<Clientes />} />
                      <Route path="/admin/fidelizacion" element={<Fidelizacion />} />
                    </Route>
                    <Route
                      element={<PrivateRoute permission="reportes.view" moduleKey="marketing" />}
                    >
                      <Route path="/admin/marketing" element={<MarketingDigital />} />
                    </Route>
                    <Route element={<PrivateRoute permission="pedidos.view" />}>
                      <Route path="/admin/whatsapp-copiloto" element={<WhatsAppCopiloto />} />
                    </Route>
                    <Route path="/admin/cuenta" element={<Cuenta />} />
                    <Route
                      element={<PrivateRoute permission="reportes.view" moduleKey="reportes" />}
                    >
                      <Route path="/admin/reportes" element={<Reportes />} />
                      <Route path="/admin/reportes-delivery" element={<ReportesDelivery />} />
                    </Route>
                    <Route element={<PrivateRoute permission="config.manage" />}>
                      <Route path="/admin/configuracion" element={<Configuracion />} />
                      <Route path="/admin/usuarios" element={<Usuarios />} />
                      <Route path="/admin/auditoria" element={<Auditoria />} />
                    </Route>
                    <Route
                      element={<PrivateRoute permission="config.manage" moduleKey="personal" />}
                    >
                      <Route path="/admin/personal" element={<Personal />} />
                    </Route>
                    <Route
                      element={<PrivateRoute permission="config.manage" moduleKey="cupones" />}
                    >
                      <Route path="/admin/cupones" element={<Cupones />} />
                    </Route>
                    <Route path="/admin/*" element={<Navigate to="/admin/dashboard" replace />} />
                  </Route>
                </Route>
              </Routes>
            </Suspense>
          </AppErrorBoundary>
        </BrowserRouter>
      </AppConfigProvider>
    </AuthProvider>
  );
}
