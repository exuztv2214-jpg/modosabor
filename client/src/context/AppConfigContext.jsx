import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

import api from '../lib/api.js';
import { applyBranding } from '../lib/branding.js';
import { isModuleEnabled as resolveModuleState } from '../lib/modules.js';
import { useAuth } from './AuthContext.jsx';

const AppConfigContext = createContext(null);
const CONFIG_CACHE_KEY = 'ms_app_config_cache';

export function AppConfigProvider({ children }) {
  const { isAuth, loading: authLoading } = useAuth();
  const [config, setConfig] = useState(() => {
    try {
      const cached = sessionStorage.getItem(CONFIG_CACHE_KEY);
      return cached ? JSON.parse(cached) : {};
    } catch {
      return {};
    }
  });
  const [loading, setLoading] = useState(true);
  const [scope, setScope] = useState('public');
  const [configError, setConfigError] = useState('');
  const refreshPromiseRef = useRef(null);
  const requestVersionRef = useRef(0);
  const configRef = useRef(config);
  configRef.current = config;

  const refreshConfig = useCallback(
    async (nextConfig = null) => {
      if (nextConfig) {
        requestVersionRef.current += 1;
        setConfig(nextConfig);
        setScope(isAuth ? 'panel' : 'public');
        applyBranding(nextConfig);
        setConfigError('');
        if (!isAuth) {
          try {
            sessionStorage.setItem(CONFIG_CACHE_KEY, JSON.stringify(nextConfig));
          } catch {
            // noop
          }
        }
        return nextConfig;
      }

      const endpoint = isAuth ? '/configuracion/panel' : '/configuracion';
      if (refreshPromiseRef.current?.endpoint === endpoint) {
        return refreshPromiseRef.current.promise;
      }

      const requestVersion = ++requestVersionRef.current;
      const request = api
        .get(endpoint)
        .then((freshConfig) => {
          // Si el login terminó mientras respondía la consulta pública, esa
          // respuesta vieja no puede pisar la configuración autenticada.
          if (requestVersion !== requestVersionRef.current) return freshConfig;
          setConfig(freshConfig);
          setScope(isAuth ? 'panel' : 'public');
          applyBranding(freshConfig);
          setConfigError('');
          if (!isAuth) {
            try {
              sessionStorage.setItem(CONFIG_CACHE_KEY, JSON.stringify(freshConfig));
            } catch {
              // noop
            }
          }
          return freshConfig;
        })
        .catch((error) => {
          if (requestVersion !== requestVersionRef.current) throw error;
          const message = error?.error || 'No se pudo cargar la configuración general';
          const cachedConfig = configRef.current;
          const hasCachedConfig = cachedConfig && Object.keys(cachedConfig).length > 0;
          if (!hasCachedConfig) {
            setConfigError(message);
          }
          throw error;
        })
        .finally(() => {
          if (refreshPromiseRef.current?.promise === request) refreshPromiseRef.current = null;
        });
      refreshPromiseRef.current = { endpoint, promise: request };

      return request;
    },
    [isAuth]
  );

  useEffect(() => {
    applyBranding(config || {});
  }, [config]);

  useEffect(() => {
    if (authLoading) return undefined;
    setLoading(true);
    refreshConfig()
      .catch(() => {})
      .finally(() => setLoading(false));
    return undefined;
  }, [authLoading, refreshConfig]);

  const desiredScope = isAuth ? 'panel' : 'public';
  const effectiveLoading = authLoading || loading || scope !== desiredScope;

  return (
    <AppConfigContext.Provider
      value={{
        config,
        loading: effectiveLoading,
        configError,
        refreshConfig,
        isModuleEnabled: (moduleKey) => resolveModuleState(config, moduleKey),
      }}
    >
      {children}
    </AppConfigContext.Provider>
  );
}

export function useAppConfig() {
  return useContext(AppConfigContext);
}
