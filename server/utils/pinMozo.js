const bcrypt = require('bcryptjs');

const { hasPermission } = require('./permissions');

/**
 * PIN de autorización del mozo.
 *
 * ── Qué problema resuelve ──────────────────────────────────────────────────
 *
 * En un turno con varios mozos, cualquiera podía cobrar o modificar una mesa
 * que no era suya. Cuando el arqueo no cerraba, no había forma de saber quién
 * había hecho qué: el pedido guarda quién lo tomó, no quién lo tocó después.
 *
 * Con esto, tocar la mesa de otro pide el PIN de esa persona. No es sólo
 * control: también evita el error honesto de cobrar la mesa equivocada.
 *
 * ── Cuándo NO pide nada ────────────────────────────────────────────────────
 *
 * · Si la protección está apagada, que es como viene de fábrica.
 * · Si el pedido no tiene mozo asignado —un delivery, un mostrador—.
 * · Si la mesa es del propio usuario.
 * · Si el usuario puede administrar pedidos: el encargado tiene que poder
 *   destrabar una mesa cuando el mozo se fue y el cliente está esperando. Sin
 *   esa salida, la protección se apagaría a la semana.
 *
 * Todo eso importa: una traba que molesta todos los días se termina
 * desactivando, y entonces no protege nada.
 */

const LARGO_PIN = 4;

function normalizarPin(valor) {
  return String(valor || '')
    .replace(/\D/g, '')
    .slice(0, LARGO_PIN);
}

function pinValido(valor) {
  return normalizarPin(valor).length === LARGO_PIN;
}

function hashearPin(valor) {
  return bcrypt.hashSync(normalizarPin(valor), 10);
}

/**
 * ¿Puede este usuario trabajar sobre la mesa de otro?
 *
 * ── El problema real que resuelve ──────────────────────────────────────────
 *
 * Hoy la respuesta es un 403 seco: la mesa es de otro mozo y no hay más
 * conversación. Eso suena prolijo hasta que pasa lo de siempre — el mozo que
 * tomó la mesa se fue, está en su descanso, o se le acabó el turno— y el
 * cliente queda esperando para pagar porque nadie más puede tocarla.
 *
 * Entonces se termina destrabando por afuera del sistema: alguien entra con el
 * usuario del otro, o se cierra la mesa desde el TPV a mano. Cualquiera de las
 * dos es peor que lo que la traba quería evitar, porque además borra el rastro.
 *
 * Con el PIN hay una salida legítima y que queda registrada: el otro mozo dicta
 * su PIN, o el encargado lo destraba con su usuario.
 *
 * Devuelve `{ ok }` con detalle, y no un booleano, para que la ruta distinga
 * "no podés" de "podés, pero falta el PIN": el mensaje es distinto.
 */
function puedeTocarMesaDeOtro(db, { usuario, duenoId, pin }) {
  const propietario = Number(duenoId || 0);
  // Sin dueño no hay a quién proteger, y la mesa propia nunca pide nada.
  if (!propietario) return { ok: true };
  if (propietario === Number(usuario?.id || 0)) return { ok: true };

  /*
    El encargado pasa sin PIN. Si tuviera que pedirle el PIN al mozo que ya se
    fue, la única salida sería apagar la protección — y una traba que se apaga
    no protege nada.

    Queda auditado igual: quién tocó qué mesa se registra siempre.
  */
  if (hasPermission(usuario, 'caja.manage') || hasPermission(usuario, 'config.manage')) {
    return { ok: true, comoEncargado: true };
  }

  const dueno = db
    .prepare('SELECT id, nombre, pin_mozo_hash FROM usuarios WHERE id = ?')
    .get(propietario);

  /*
    Si el dueño nunca configuró PIN, se mantiene el 403 de antes. No se puede
    pedir algo que no existe, y dejar pasar sin nada convertiría "no tengo PIN"
    en la forma de saltear el control.
  */
  if (!dueno?.pin_mozo_hash) {
    return {
      ok: false,
      requierePin: false,
      motivo: `Esta mesa es de ${dueno?.nombre || 'otro mozo'} y todavía no tiene PIN cargado. Pedile al encargado que la destrabe.`,
    };
  }

  if (!pinValido(pin)) {
    return {
      ok: false,
      requierePin: true,
      motivo: `Esta mesa es de ${dueno.nombre}. Pedile su PIN para poder trabajarla.`,
    };
  }

  if (!bcrypt.compareSync(normalizarPin(pin), dueno.pin_mozo_hash)) {
    return { ok: false, requierePin: true, motivo: 'El PIN no es correcto' };
  }

  return { ok: true, conPinDe: dueno.nombre };
}

module.exports = {
  LARGO_PIN,
  normalizarPin,
  pinValido,
  hashearPin,
  puedeTocarMesaDeOtro,
};
