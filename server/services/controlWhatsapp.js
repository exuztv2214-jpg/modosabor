function crearControl(db, telefono) {
  const leer = () =>
    db
      .prepare(
        'SELECT control_version, bot_silenciado FROM whatsapp_conversaciones WHERE telefono = ?'
      )
      .get(telefono);
  let version = Number(leer()?.control_version || 0);
  let derivacionPropia = false;
  function assertControl() {
    const fila = leer();
    const config = Object.fromEntries(
      db
        .prepare(
          "SELECT clave, valor FROM configuracion WHERE clave IN ('whatsapp_gateway_pausa_total','whatsapp_atencion_ia_activa')"
        )
        .all()
        .map((r) => [r.clave, r.valor])
    );
    if (
      !fila ||
      Number(fila.control_version || 0) !== version ||
      (fila.bot_silenciado && !derivacionPropia) ||
      config.whatsapp_gateway_pausa_total === '1' ||
      config.whatsapp_atencion_ia_activa !== '1'
    ) {
      const error = new Error('La atención automática fue interrumpida');
      error.code = 'WHATSAPP_CONTROL_CHANGED';
      throw error;
    }
  }
  return {
    assertControl,
    aceptarDerivacion() {
      version = Number(leer()?.control_version || 0);
      derivacionPropia = true;
    },
  };
}
module.exports = { crearControl };
