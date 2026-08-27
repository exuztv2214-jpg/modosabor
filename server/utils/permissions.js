const ROLE_PERMISSIONS = {
  admin: ['*'],
  caja: [
    'dashboard.view',
    'dashboard.finanzas',
    'tpv.use',
    'pedidos.view',
    'pedidos.edit',
    'pedidos.print',
    'mesas.view',
    'clientes.view',
    'clientes.edit',
    'reportes.view',
    'caja.view',
    'caja.manage',
    'configuracion.view',
  ],
  cocina: ['dashboard.view', 'kds.view', 'pedidos.view', 'pedidos.kitchen', 'pedidos.print'],
  delivery: [
    'dashboard.view',
    'delivery.view',
    'delivery.manage',
    'pedidos.view',
    'configuracion.view',
  ],
  // El mozo usa una app separada: no hereda TPV ni Caja. Sus únicas acciones
  // operativas pasan por la API /api/mozo, que valida mesa y precios.
  mozo: ['mozo.use'],
};

function getPermissionsForRole(role) {
  return ROLE_PERMISSIONS[role] || [];
}

function hasPermission(user, permission) {
  if (!user) return false;
  const permissions = getPermissionsForRole(user.rol);
  return permissions.includes('*') || permissions.includes(permission);
}

function requirePermission(permission) {
  return (req, res, next) => {
    if (hasPermission(req.user, permission)) return next();
    return res.status(403).json({ error: 'Sin permisos para esta accion' });
  };
}

module.exports = {
  ROLE_PERMISSIONS,
  getPermissionsForRole,
  hasPermission,
  requirePermission,
};
