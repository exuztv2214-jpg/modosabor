const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { ConexionWhatsapp } = require('../../services/whatsappMasivo/conexion');

function run() {
  console.log('\nTests de recuperación de sesión de WhatsApp');
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'modosabor-wa-sesion-'));
  const sesion = path.join(raiz, 'whatsapp-sesion');
  fs.mkdirSync(sesion);
  fs.writeFileSync(path.join(sesion, 'creds.json'), '{"sesion":"vencida"}');

  try {
    const conexion = new ConexionWhatsapp({ carpetaSesion: sesion });
    conexion.limpiarSesionInvalida();
    assert.strictEqual(fs.existsSync(sesion), false, 'debe borrar sólo las credenciales inválidas');
    assert.strictEqual(fs.existsSync(raiz), true, 'no debe borrar el directorio contenedor');
    console.log('  ✓ una sesión cerrada se limpia sin tocar otros datos');
  } finally {
    fs.rmSync(raiz, { recursive: true, force: true });
  }

  const conexion = new ConexionWhatsapp();
  const setTimeoutOriginal = global.setTimeout;
  let ejecutarReintento;
  let aperturas = 0;
  global.setTimeout = (callback) => {
    ejecutarReintento = callback;
    return {};
  };
  try {
    conexion.estado = 'conectando';
    conexion.conectar = () => {
      aperturas += 1;
    };
    conexion.programarReconexion(3000);
    ejecutarReintento();
    assert.strictEqual(aperturas, 1, 'el reintento debe abrir un socket nuevo');
    assert.strictEqual(conexion.estado, 'apagado', 'debe liberar el estado antes de reconectar');
    console.log('  ✓ el reinicio pedido por WhatsApp no queda bloqueado en conectando');
  } finally {
    global.setTimeout = setTimeoutOriginal;
  }
  console.log('✅ Recuperación de sesión de WhatsApp verificada\n');
}

run();
