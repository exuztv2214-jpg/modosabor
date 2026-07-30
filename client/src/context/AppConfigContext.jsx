import { createContext, useContext, useEffect, useRef, useState } from 'react';

import api from '../lib/api.js';
import { applyBranding } from '../lib/branding.js';
import { isModuleEnabled as resolveModuleState } from '../lib/modules.js';

const AppConfigContext = createContext(null);
const CONFIG_CACHE_KEY = 'ms_app_config_cache';

export function AppConfigProvider({ children }) {
  const [config, setConfig] = useState(() => {
    try {
      const cached = sessionStorage.getItem(CONFIG_CACHE_KEY);
      return cached ? JSON.parse(cached) : {};
    } catch {
      return {};
    }
  });
  const [loading, setLoading] = useState(true);
  const [configError, setConfigError] = useState('');
  const refreshPromiseRef = useRef(null);

  const refreshConfig = async (nextConfig = null) => {
    if (nextConfig) {
      setConfig(nextConfig);
      applyBranding(nextConfig);
      setConfigError('');
      try {
        sessionStorage.setItem(CONFIG_CACHE_KEY, JSON.stringify(nextConfig));
      } catch {
        // noop
      }
      return nextConfig;
    }

    if (refreshPromiseRef.current) {
      return refreshPromiseRef.current;
    }

    refreshPromiseRef.current = api
      .get('/configuracion')
      .then((freshConfig) => {
        setConfig(freshConfig);
        applyBranding(freshConfig);
        setConfigError('');
        try {
          sessionStorage.setItem(CONFIG_CACHE_KEY, JSON.stringify(freshConfig));
        } catch {
          // noop
        }
        return freshConfig;
      })
      .catch((error) => {
        const message = error?.error || 'No se pudo cargar la configuración general';
        const hasCachedConfig = config && Object.keys(config).length > 0;
        if (!hasCachedConfig) {
          setConfigError(message);
        }
        throw error;
      })
      .finally(() => {
        refreshPromiseRef.current = null;
      });

    return refreshPromiseRef.current;
  };

  useEffect(() => {
    applyBranding(config || {});
    refreshConfig()
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <AppConfigContext.Provider
      value={{
        config,
        loading,
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
