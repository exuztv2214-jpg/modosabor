import { createContext, useContext, useState, useEffect } from 'react';

import { getPermissionsForRole, hasPermission as canUser } from '../lib/permissions.js';
import api from '../lib/api.js';
const Ctx = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const refreshUser = async () => {
    const fresh = await api.get('/auth/me');
    const normalized = {
      ...fresh,
      permissions: fresh.permissions || getPermissionsForRole(fresh.rol),
    };
    setUser(normalized);
    return normalized;
  };

  useEffect(() => {
    refreshUser()
      .catch(() => {
        setUser(null);
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  const login = (u) => {
    const normalized = { ...u, permissions: u.permissions || getPermissionsForRole(u.rol) };
    setUser(normalized);
  };

  const logout = async () => {
    try {
      await api.post('/auth/logout');
    } catch {
      // noop
    }
    setUser(null);
    window.location.href = '/admin';
  };

  return (
    <Ctx.Provider
      value={{
        user,
        loading,
        login,
        logout,
        refreshUser,
        isAuth: !!user,
        hasPermission: (permission) => canUser(user, permission),
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export const useAuth = () => useContext(Ctx);
