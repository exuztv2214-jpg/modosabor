/**
 * ¿Está completo el armado de un producto?
 *
 * ── El comportamiento de siempre ───────────────────────────────────────────
 *
 * Hasta ahora había una sola regla y no estaba escrita en ningún lado: **todos
 * los grupos son obligatorios**. Si una pizza tenía "Presentación", no se podía
 * agregar al pedido sin elegir una. Eso está bien: una pizza sin tamaño no se
 * puede cocinar ni cobrar.
 *
 * ── Qué cambia ─────────────────────────────────────────────────────────────
 *
 * Las listas compartidas trajeron grupos que sí pueden ser opcionales —una
 * salsa que se agrega si el cliente quiere—, y para eso tienen un campo
 * `obligatorio`.
 *
 * La regla nueva es deliberadamente angosta: un grupo es opcional **sólo si
 * viene de una lista compartida y esa lista dice que no es obligatoria**. Se
 * reconoce por `lista_id`, que se lo pone el servidor al mezclarla.
 *
 * Todo lo demás sigue siendo obligatorio, como hasta hoy. Es a propósito: los
 * grupos cargados a mano adentro de cada plato no tienen el campo, así que
 * tratarlos como opcionales por no encontrarlo dejaría vender una pizza sin
 * tamaño y una milanesa sin saber si es de carne o de pollo. Un cambio así no
 * avisa: sale una comanda incompleta y se discute en el mostrador.
 */

export function grupoEsObligatorio(grupo) {
  if (!grupo?.lista_id) return true;
  return Number(grupo?.obligatorio) === 1;
}

export function faltaElegirGrupo(grupos, seleccion) {
  return (grupos || []).find((grupo) => {
    if (!grupoEsObligatorio(grupo)) return false;
    const elegido = seleccion?.[grupo?.nombre];
    return !(elegido?.nombre || elegido);
  });
}

export function variantesCompletas(grupos, seleccion) {
  return !faltaElegirGrupo(grupos, seleccion);
}
