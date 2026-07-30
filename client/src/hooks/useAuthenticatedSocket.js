import { useEffect, useRef, useState } from 'react';

import { socketManager } from '../lib/socket.js';
import { useAuth } from '../context/AuthContext.jsx';

/**
 * Hook para usar sockets autenticados en páginas de admin
 * Maneja automáticamente la conexión, autenticación y reconexión
 */
export function useAuthenticatedSocket(events = {}) {
  const { token, isAuth } = useAuth();
  const [connected, setConnected] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const unsubscribersRef = useRef([]);

  useEffect(() => {
    if (!isAuth || !token) return;

    let mounted = true;

    const connect = async () => {
      try {
        await socketManager.connectAuthenticated(token);
        if (!mounted) return;

        setConnected(true);
        setAuthenticated(true);

        // Registrar listeners de eventos
        Object.entries(events).forEach(([event, callback]) => {
          const unsubscribe = socketManager.on(event, callback);
          unsubscribersRef.current.push(unsubscribe);
        });

        // Listener de conexión/desconexión con optional chaining
        socketManager.socket?.on('connect', () => setConnected(true));
        socketManager.socket?.on('disconnect', () => setConnected(false));
        socketManager.socket.on('connect', () => setConnected(true));
        socketManager.socket.on('disconnect', () => setConnected(false));
      } catch (error) {
        console.error('Error conectando socket:', error);
        setConnected(false);
        setAuthenticated(false);
      }
    };

    connect();

    return () => {
      mounted = false;
      // Limpiar todos los listeners registrados
      unsubscribersRef.current.forEach((unsubscribe) => unsubscribe());
      unsubscribersRef.current = [];
      socketManager.disconnect();
      setConnected(false);
      setAuthenticated(false);
    };
  }, [token, isAuth]);

  return { connected, authenticated };
}

/**
 * Hook para escuchar eventos específicos
 */
export function useSocketEvent(event, callback) {
  useEffect(() => {
    const unsubscribe = socketManager.on(event, callback);
    return () => unsubscribe();
  }, [event, callback]);
}
