/**
 * Maquina de estados para pedidos.
 * Permite un flujo completo con KDS y un flujo simple cuando cocina/KDS esta desactivado.
 */

const PedidoState = {
  NUEVO: 'nuevo',
  CONFIRMADO: 'confirmado',
  PREPARANDO: 'preparando',
  LISTO: 'listo',
  EN_CAMINO: 'en_camino',
  ENTREGADO: 'entregado',
  CANCELADO: 'cancelado',
};

const VALID_TRANSITIONS = {
  [PedidoState.NUEVO]: [PedidoState.CONFIRMADO, PedidoState.CANCELADO],
  [PedidoState.CONFIRMADO]: [PedidoState.PREPARANDO, PedidoState.CANCELADO],
  [PedidoState.PREPARANDO]: [PedidoState.LISTO, PedidoState.CANCELADO],
  [PedidoState.LISTO]: [PedidoState.EN_CAMINO, PedidoState.ENTREGADO, PedidoState.CANCELADO],
  [PedidoState.EN_CAMINO]: [PedidoState.ENTREGADO, PedidoState.CANCELADO],
  [PedidoState.ENTREGADO]: [],
  [PedidoState.CANCELADO]: [],
};

const TERMINAL_STATES = [PedidoState.ENTREGADO, PedidoState.CANCELADO];
const EDITABLE_STATES = [PedidoState.NUEVO, PedidoState.CONFIRMADO];

function isSimpleFlow(context = {}) {
  return context?.simpleFlow === true;
}

function canTransition(fromState, toState) {
  if (!fromState || !toState) return false;
  const validTargets = VALID_TRANSITIONS[fromState];
  if (!validTargets) return false;
  return validTargets.includes(toState);
}

function getValidTransitions(fromState) {
  return VALID_TRANSITIONS[fromState] || [];
}

function getAvailableTransitions(fromState, context = {}) {
  const base = [...getValidTransitions(fromState)];

  if (!isSimpleFlow(context)) {
    return base;
  }

  if (fromState === PedidoState.NUEVO && !base.includes(PedidoState.PREPARANDO)) {
    base.unshift(PedidoState.PREPARANDO);
  }

  if (fromState === PedidoState.PREPARANDO) {
    if (context.tipoEntrega === 'delivery') {
      if (!base.includes(PedidoState.EN_CAMINO)) {
        base.unshift(PedidoState.EN_CAMINO);
      }
    } else if (!base.includes(PedidoState.ENTREGADO)) {
      base.unshift(PedidoState.ENTREGADO);
    }
  }

  return Array.from(new Set(base));
}

function isTerminal(state) {
  return TERMINAL_STATES.includes(state);
}

function isEditable(state) {
  return EDITABLE_STATES.includes(state);
}

function validateTransition(fromState, toState, context = {}) {
  if (!VALID_TRANSITIONS[fromState]) {
    return { valid: false, reason: `Estado origen invalido: ${fromState}` };
  }

  if (!VALID_TRANSITIONS[toState]) {
    return { valid: false, reason: `Estado destino invalido: ${toState}` };
  }

  const allowedTransitions = getAvailableTransitions(fromState, context);
  if (!allowedTransitions.includes(toState)) {
    return {
      valid: false,
      reason: `Transicion no permitida: ${fromState} -> ${toState}`,
    };
  }

  if (toState === PedidoState.EN_CAMINO && context.tipoEntrega === 'delivery') {
    if (!context.repartidorId && !isSimpleFlow(context)) {
      return {
        valid: false,
        reason: 'Se requiere asignar un repartidor antes de marcar "en camino"',
      };
    }
  }

  if (toState === PedidoState.ENTREGADO && context.tipoEntrega === 'delivery') {
    if (context.requierePin && !context.pinValidado) {
      return {
        valid: false,
        reason: 'Se requiere validar el PIN de entrega',
      };
    }

    if (context.requiereFoto && !context.fotoEntrega) {
      return {
        valid: false,
        reason: 'Se requiere foto de entrega',
      };
    }
  }

  if (toState === PedidoState.CANCELADO && fromState === PedidoState.ENTREGADO) {
    return {
      valid: false,
      reason: 'No se puede cancelar un pedido ya entregado',
    };
  }

  return { valid: true };
}

function getStateLabel(state) {
  const labels = {
    [PedidoState.NUEVO]: 'Recibido',
    [PedidoState.CONFIRMADO]: 'Confirmado',
    [PedidoState.PREPARANDO]: 'Preparando',
    [PedidoState.LISTO]: 'Listo',
    [PedidoState.EN_CAMINO]: 'En camino',
    [PedidoState.ENTREGADO]: 'Entregado',
    [PedidoState.CANCELADO]: 'Cancelado',
  };

  return labels[state] || state;
}

function getStateColor(state) {
  const colors = {
    [PedidoState.NUEVO]: '#f97316',
    [PedidoState.CONFIRMADO]: '#3b82f6',
    [PedidoState.PREPARANDO]: '#f59e0b',
    [PedidoState.LISTO]: '#10b981',
    [PedidoState.EN_CAMINO]: '#8b5cf6',
    [PedidoState.ENTREGADO]: '#22c55e',
    [PedidoState.CANCELADO]: '#ef4444',
  };

  return colors[state] || '#6b7280';
}

function canUserTransitionWithContext(user, fromState, toState, tipoEntrega, context = {}) {
  if (!user) return false;

  const { hasPermission } = require('./permissions');

  if (hasPermission(user, 'pedidos.edit')) return true;

  if (hasPermission(user, 'pedidos.kitchen')) {
    if (fromState === PedidoState.CONFIRMADO && toState === PedidoState.PREPARANDO) return true;
    if (fromState === PedidoState.PREPARANDO && toState === PedidoState.LISTO) return true;
    if (
      fromState === PedidoState.LISTO &&
      tipoEntrega !== 'delivery' &&
      toState === PedidoState.ENTREGADO
    ) {
      return true;
    }
    if (
      fromState === PedidoState.LISTO &&
      tipoEntrega === 'delivery' &&
      toState === PedidoState.EN_CAMINO
    ) {
      return true;
    }
    if (
      isSimpleFlow(context) &&
      fromState === PedidoState.NUEVO &&
      toState === PedidoState.PREPARANDO
    ) {
      return true;
    }
    if (
      isSimpleFlow(context) &&
      fromState === PedidoState.PREPARANDO &&
      tipoEntrega === 'delivery' &&
      toState === PedidoState.EN_CAMINO
    ) {
      return true;
    }
    if (
      isSimpleFlow(context) &&
      fromState === PedidoState.PREPARANDO &&
      tipoEntrega !== 'delivery' &&
      toState === PedidoState.ENTREGADO
    ) {
      return true;
    }
    return false;
  }

  if (hasPermission(user, 'delivery.manage')) {
    if (tipoEntrega !== 'delivery') return false;
    if (fromState === PedidoState.LISTO && toState === PedidoState.EN_CAMINO) return true;
    if (fromState === PedidoState.EN_CAMINO && toState === PedidoState.ENTREGADO) return true;
    if (
      isSimpleFlow(context) &&
      fromState === PedidoState.PREPARANDO &&
      toState === PedidoState.EN_CAMINO
    ) {
      return true;
    }
    return false;
  }

  return false;
}

function canUserTransition(user, fromState, toState, tipoEntrega) {
  return canUserTransitionWithContext(user, fromState, toState, tipoEntrega, {});
}

module.exports = {
  PedidoState,
  VALID_TRANSITIONS,
  TERMINAL_STATES,
  EDITABLE_STATES,
  canTransition,
  getValidTransitions,
  getAvailableTransitions,
  isTerminal,
  isEditable,
  validateTransition,
  getStateLabel,
  getStateColor,
  canUserTransition,
  canUserTransitionWithContext,
};
