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
  const eventsRef = useRef(events);
  eventsRef.current = events;

  useEffect(() => {
    if (!isAuth) return undefined;

    let mounted = true;

    const connect = async () => {
      try {
        await socketManager.retainSession(token);
        if (!mounted) return;

        setConnected(socketManager.isConnected());
        setAuthenticated(socketManager.isAuthenticated());

        // Registrar listeners de eventos
        Object.keys(eventsRef.current).forEach((event) => {
          const unsubscribe = socketManager.on(event, (...args) => {
            eventsRef.current[event]?.(...args);
          });
          unsubscribersRef.current.push(unsubscribe);
        });

        const handleConnect = () => setConnected(true);
        const handleDisconnect = () => {
          setConnected(false);
          setAuthenticated(false);
        };
        const handleAuthenticated = (response) => setAuthenticated(Boolean(response?.success));
        socketManager.socket?.on('connect', handleConnect);
        socketManager.socket?.on('disconnect', handleDisconnect);
        socketManager.socket?.on('authenticated', handleAuthenticated);
        unsubscribersRef.current.push(() => {
          socketManager.socket?.off('connect', handleConnect);
          socketManager.socket?.off('disconnect', handleDisconnect);
          socketManager.socket?.off('authenticated', handleAuthenticated);
        });
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
      socketManager.releaseAuthenticated();
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
