import { io } from 'socket.io-client';
import { useEffect } from 'react';

import { SOCKET_URL } from './runtime';

/**
 * Gestion segura de Socket.IO para el frontend.
 * Mantiene una conexion compartida y permite retenerla
 * desde el layout para notificaciones globales.
 */
class SocketManager {
  constructor() {
    this.socket = null;
    this.authenticated = false;
    this.authToken = null;
    this.authPromise = null;
    this.listeners = new Map();
    this.trackingRooms = new Set();
    this.trackingSubscriptions = new Map();
    this.riderSubscription = null;
    this.riderJoined = false;
    this.hasConnectedOnce = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.persistentConnections = 0;
  }

  connect() {
    if (this.socket?.connected) return this.socket;
    if (this.socket) {
      this.socket.connect();
      return this.socket;
    }

    this.socket = io(SOCKET_URL, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: this.maxReconnectAttempts,
      reconnectionDelay: 1000,
      withCredentials: true,
    });

    this.setupBaseListeners();
    return this.socket;
  }

  connectAuthenticated(token) {
    if (token) {
      this.authToken = token;
    }

    if (!this.authToken) {
      return Promise.reject(new Error('Token de autenticacion faltante'));
    }

    if (this.socket?.connected && this.authenticated) {
      return Promise.resolve(this.socket);
    }

    if (this.authPromise) {
      return this.authPromise;
    }

    this.connect();

    this.authPromise = new Promise((resolve, reject) => {
      const cleanup = () => {
        this.socket?.off('authenticated', handleAuthenticated);
        this.socket?.off('connect', handleConnect);
        this.socket?.off('connect_error', handleConnectError);
      };

      const finishWithError = (error) => {
        clearTimeout(timeout);
        cleanup();
        this.authPromise = null;
        this.authenticated = false;
        reject(error);
      };

      const handleAuthenticated = (response) => {
        clearTimeout(timeout);
        cleanup();
        this.authPromise = null;
        if (response?.success) {
          this.authenticated = true;
          resolve(this.socket);
        } else {
          this.authenticated = false;
          reject(new Error(response?.error || 'Autenticacion fallida'));
        }
      };

      const handleConnect = () => {
        this.socket?.emit('authenticate', this.authToken);
      };

      const handleConnectError = (error) => {
        finishWithError(
          error instanceof Error ? error : new Error('No se pudo conectar el socket')
        );
      };

      const timeout = setTimeout(() => {
        finishWithError(new Error('Timeout en autenticacion'));
      }, 5000);

      this.socket.on('authenticated', handleAuthenticated);
      this.socket.once('connect_error', handleConnectError);

      if (this.socket.connected) {
        handleConnect();
      } else {
        this.socket.once('connect', handleConnect);
      }
    });

    return this.authPromise;
  }

  retainAuthenticated(token) {
    this.persistentConnections += 1;
    return this.connectAuthenticated(token);
  }

  releaseAuthenticated() {
    this.persistentConnections = Math.max(0, this.persistentConnections - 1);
    if (this.persistentConnections === 0) {
      this.disconnect(true);
    }
  }

  joinTracking(pedidoId, token) {
    if (!this.socket?.connected) {
      this.connect();
    }

    const roomKey = `tracking_${pedidoId}`;
    this.trackingSubscriptions.set(roomKey, { pedidoId, token });

    if (this.trackingRooms.has(roomKey)) return Promise.resolve();

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Timeout uniendose a tracking'));
      }, 5000);

      this.socket.once('tracking_joined', ({ pedidoId: joinedId }) => {
        clearTimeout(timeout);
        if (String(joinedId) === String(pedidoId)) {
          this.trackingRooms.add(roomKey);
          resolve();
        }
      });

      this.socket.once('tracking_error', (error) => {
        clearTimeout(timeout);
        this.trackingSubscriptions.delete(roomKey);
        reject(new Error(error.message || 'Error en tracking'));
      });

      this.socket.emit('join_tracking', { pedidoId, token });
    });
  }

  joinRider(repartidorId, codigo) {
    if (!this.socket?.connected) {
      this.connect();
    }

    this.riderSubscription = { repartidorId, codigo };
    if (this.riderJoined) return Promise.resolve();

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Timeout en autenticacion de rider'));
      }, 5000);

      this.socket.once('rider_joined', ({ repartidorId: joinedId }) => {
        clearTimeout(timeout);
        if (String(joinedId) === String(repartidorId)) {
          this.riderJoined = true;
          resolve();
        }
      });

      this.socket.once('rider_error', (error) => {
        clearTimeout(timeout);
        reject(new Error(error.message || 'Error de acceso'));
      });

      this.socket.emit('join_rider', { repartidorId, codigo });
    });
  }

  on(event, callback) {
    if (!this.socket) {
      this.connect();
    }

    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event).add(callback);

    this.socket.on(event, callback);
    return () => this.off(event, callback);
  }

  off(event, callback) {
    if (!this.socket) return;

    this.socket.off(event, callback);

    const eventListeners = this.listeners.get(event);
    if (eventListeners) {
      eventListeners.delete(callback);
    }
  }

  disconnect(force = false) {
    if (!force && this.persistentConnections > 0) {
      return;
    }

    if (!this.socket) return;

    this.listeners.forEach((callbacks, event) => {
      callbacks.forEach((callback) => {
        this.socket.off(event, callback);
      });
    });
    this.listeners.clear();

    this.trackingRooms.clear();
    this.trackingSubscriptions.clear();
    this.riderSubscription = null;
    this.riderJoined = false;
    this.hasConnectedOnce = false;
    this.authenticated = false;
    this.authPromise = null;

    this.socket.disconnect();
    this.socket = null;
  }

  setupBaseListeners() {
    this.socket.on('connect', () => {
      this.reconnectAttempts = 0;
      if (this.authToken && !this.authenticated) {
        this.socket.emit('authenticate', this.authToken);
      }
      if (this.hasConnectedOnce) {
        this.trackingSubscriptions.forEach(({ pedidoId, token }) => {
          this.socket.emit('join_tracking', { pedidoId, token });
        });
        if (this.riderSubscription) {
          this.socket.emit('join_rider', this.riderSubscription);
        }
      }
      this.hasConnectedOnce = true;
    });

    this.socket.on('disconnect', () => {
      this.authenticated = false;
      this.trackingRooms.clear();
      this.riderJoined = false;
    });

    this.socket.on('tracking_joined', ({ pedidoId }) => {
      this.trackingRooms.add(`tracking_${pedidoId}`);
    });

    this.socket.on('rider_joined', () => {
      this.riderJoined = true;
    });

    this.socket.on('connect_error', () => {
      this.reconnectAttempts += 1;
      if (this.reconnectAttempts >= this.maxReconnectAttempts) {
        this.socket?.disconnect();
      }
    });

    this.socket.on('authenticated', (response) => {
      this.authenticated = Boolean(response?.success);
    });
  }

  isConnected() {
    return this.socket?.connected || false;
  }

  isAuthenticated() {
    return this.authenticated;
  }
}

export const socketManager = new SocketManager();

export function useSocket(event, callback, deps = []) {
  useEffect(() => {
    const unsubscribe = socketManager.on(event, callback);
    return () => {
      unsubscribe();
    };
  }, deps);
}
