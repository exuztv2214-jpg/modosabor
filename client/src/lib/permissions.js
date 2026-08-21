export const ROLE_PERMISSIONS = {
  admin: ['*'],
  caja: [
    'dashboard.view',
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
  mozo: ['mozo.use'],
};

export function getPermissionsForRole(role) {
  return ROLE_PERMISSIONS[role] || [];
}

export function hasPermission(user, permission) {
  if (!user) return false;
  const permissions = user.permissions || getPermissionsForRole(user.rol);
  return permissions.includes('*') || permissions.includes(permission);
}
