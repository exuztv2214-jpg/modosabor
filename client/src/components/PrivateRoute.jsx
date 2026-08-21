import { Navigate, Outlet } from 'react-router-dom';

import { useAuth } from '../context/AuthContext.jsx';
import { useAppConfig } from '../context/AppConfigContext.jsx';

export default function PrivateRoute({
  permission,
  moduleKey,
  loginTo = '/admin',
  unauthorizedTo = '/admin/dashboard',
}) {
  const { isAuth, loading, hasPermission } = useAuth();
  const { loading: configLoading, isModuleEnabled } = useAppConfig();
  if (loading)
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
          <p className="text-gray-500 text-sm">Cargando...</p>
        </div>
      </div>
    );
  if (moduleKey && configLoading)
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
          <p className="text-gray-500 text-sm">Cargando...</p>
        </div>
      </div>
    );
  if (isAuth && permission && !hasPermission(permission))
    return <Navigate to={unauthorizedTo} replace />;
  if (isAuth && moduleKey && !isModuleEnabled(moduleKey))
    return <Navigate to={unauthorizedTo} replace />;
  return isAuth ? <Outlet /> : <Navigate to={loginTo} replace />;
}
