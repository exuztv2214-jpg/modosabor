/**
 * Tokens visuales del panel de Modo Sabor.
 *
 * Nacieron en el rediseño del TPV y se extraen acá para que el resto de
 * los módulos puedan usar el mismo lenguaje sin copiar constantes.
 *
 * Las tres reglas que ordenan todo:
 *
 *  1. Un solo acento. El rojo de marca se usa para lo que importa —acción
 *     principal, plata, elemento activo— y nada más. Un color que aparece
 *     en todos lados deja de significar algo.
 *
 *  2. El peso tipográfico se gana. `font-bold` queda reservado para plata.
 *     Títulos en 600, etiquetas en 500, texto corriente normal. Nada de
 *     `font-black` ni de MAYÚSCULAS con letter-spacing.
 *
 *  3. Dos radios: 12px para controles, 16px para tarjetas. La separación
 *     entre bloques la hace el fondo gris, no los bordes.
 */

export const BRAND = '#DC1F2D';
export const APP_BG = '#F6F7F9';

/** Grosor de trazo único para todos los íconos de lucide. */
export const STROKE = 1.9;

/**
 * Capas de apilado.
 *
 * El sidebar es `fixed` con `z-[70]`, y la mayoría de los modales del panel
 * estaban en `z-50`: se abrían *por debajo* del menú. En pantallas anchas el
 * modal quedaba centrado sobre todo el viewport con la franja izquierda
 * tapada por el sidebar, que es exactamente lo que se veía como "corrido al
 * costado".
 *
 * Los números tampoco tenían criterio: convivían 50, 60, 70, 90, 100, 200,
 * 1000, 2000, 9999, 10000 y 20000 según quién hubiera escrito cada archivo.
 *
 * Escala única, de abajo hacia arriba:
 */
export const Z = {
  /** Cabecera pegajosa del panel. */
  header: 50,
  /** Sidebar y su overlay en móvil. */
  sidebar: 70,
  /** Cualquier modal del panel. Siempre por encima del sidebar. */
  modal: 100,
  /** Modal lanzado desde otro modal (selector de foto, por ejemplo). */
  modalSobreModal: 120,
  /** Confirmaciones destructivas: van arriba de todo. */
  dialog: 140,
};

/**
 * Paleta de estados del pedido.
 *
 * Acá el color sí codifica información —en qué etapa está cada pedido— así
 * que es la excepción justificada a la regla del acento único. Se usan
 * tonos pastel de fondo con texto oscuro de la misma familia, que es lo
 * que evita que un tablero con cincuenta tarjetas parezca un carnaval.
 */
export const ESTADO_TONOS = {
  nuevo: { bg: '#FEF2F2', fg: '#9E141E', dot: '#DC1F2D', label: 'Nuevo' },
  confirmado: { bg: '#F1F5F9', fg: '#334155', dot: '#64748B', label: 'Confirmado' },
  preparando: { bg: '#FEF6E7', fg: '#92400E', dot: '#F59E0B', label: 'Preparando' },
  listo: { bg: '#ECFDF5', fg: '#065F46', dot: '#10B981', label: 'Listo' },
  en_camino: { bg: '#EFF6FF', fg: '#1E40AF', dot: '#3B82F6', label: 'En camino' },
  entregado: { bg: '#ECFDF5', fg: '#065F46', dot: '#10B981', label: 'Entregado' },
  cancelado: { bg: '#F5F5F4', fg: '#57534E', dot: '#A8A29E', label: 'Cancelado' },
};

export function estadoTono(estado) {
  return (
    ESTADO_TONOS[estado] || {
      bg: '#F5F5F4',
      fg: '#57534E',
      dot: '#A8A29E',
      label: String(estado || '').replace(/_/g, ' '),
    }
  );
}
