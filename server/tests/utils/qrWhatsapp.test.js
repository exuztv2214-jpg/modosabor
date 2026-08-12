/**
 * El código para vincular WhatsApp no sale del sistema.
 *
 * La pantalla dibujaba el QR pidiéndole la imagen a api.qrserver.com:
 *
 *     <img src="https://api.qrserver.com/...?data=EL_CODIGO">
 *
 * Ese código no es un dato cualquiera. Es la credencial de vinculación: quien
 * lo tenga, mientras está vigente, puede vincular su propio teléfono al
 * WhatsApp del local y quedarse adentro —leer todas las conversaciones con los
 * clientes y escribir en nombre del negocio—. Iba en la URL, o sea en los
 * registros de ese servicio y de cualquiera en el camino.
 *
 * Ahora se dibuja en el servidor y viaja como imagen. Este test cuida las dos
 * mitades: que el dibujo funcione de verdad, y que nadie vuelva a mandar el
 * código crudo a un tercero.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const QRCode = require('qrcode');

function run() {
  console.log('\n📱 Vinculación de WhatsApp\n');

  // ── 1. El dibujo funciona ─────────────────────────────────────────────────
  //
  // Un código de vinculación real de Baileys: cuatro partes separadas por
  // coma, con claves en base64. Son ~200 caracteres, bastante más que un texto
  // corto, así que sirve para confirmar que entra en un QR de este tamaño.
  const codigoReal =
    '2@k8Jd0aLpQ1vXn3Yb7Rt5Wz9Cm2Hs4Gf6Jk8Lp0Qv1Xn3Zb5Rt7Wy9Cm1Hs3Gf5Jk7Lp9Qv,' +
    'aB3dE5gH7jK9lM1nO3pQ5rS7tU9vW1xY3zA5bC7dE9fG1hI3jK5=,' +
    'nO5pQ7rS9tU1vW3xY5zA7bC9dE1fG3hI5jK7lM9nO1pQ3rS5tU7=,' +
    'zA9bC1dE3fG5hI7jK9lM1nO3pQ5rS7tU9vW1xY3zA5bC7dE9fG1=';

  return QRCode.toDataURL(codigoReal, { width: 260, margin: 1, errorCorrectionLevel: 'M' }).then(
    (imagen) => {
      assert.ok(imagen.startsWith('data:image/png;base64,'), 'el QR no salió como imagen PNG');
      assert.ok(imagen.length > 1000, 'la imagen salió sospechosamente chica');
      console.log(`  ✓ dibuja un código real de ${codigoReal.length} caracteres`);
      console.log(
        `    (imagen de ${Math.round(imagen.length / 1024)} KB, viaja adentro de la respuesta)`
      );

      // ── 2. El código crudo no se manda ──────────────────────────────────────
      //
      // Esto es lo que más importa. Si mañana alguien devuelve `qr` sin
      // dibujar "para que el cliente lo maneje", la credencial vuelve a salir
      // del sistema y nadie se entera.
      const ruta = fs.readFileSync(path.join(__dirname, '../../routes/whatsappMasivo.js'), 'utf8');

      //
      // Se cuenta que el dibujo se USE, no que la palabra aparezca. La primera
      // versión sólo miraba si el archivo contenía "qrImagen", y cuando se
      // probó sacándole el dibujo a /estado el test siguió en verde: la
      // palabra seguía estando en /conectar. Un test que se conforma con que
      // el nombre exista no cuida nada.
      //
      // Son dos los lugares que devuelven el estado de la sesión —/estado, que
      // la pantalla consulta cada pocos segundos, y /conectar, que responde al
      // botón— y los dos tienen que dibujarlo.
      const usos = (ruta.match(/qrDibujado\(/g) || []).length;
      assert.ok(
        usos >= 3,
        `el QR se dibuja en ${usos - 1} de los 2 lugares que devuelven la sesión`
      );

      const vecesQueSeBorra = (ruta.match(/qr: undefined/g) || []).length;
      assert.ok(
        vecesQueSeBorra >= 2,
        `el código crudo sale sin borrar en ${2 - vecesQueSeBorra} de los 2 endpoints`
      );
      console.log('  ✓ los dos endpoints dibujan el QR y borran el código crudo');

      // ── 3. La pantalla no se lo pasa a nadie ────────────────────────────────
      const pantallas = [
        '../../../client/src/pages/Marketing/MarketingWhatsapp.jsx',
        '../../../client/src/components/Configuracion/SeccionWhatsapp.jsx',
      ].map((rutaPantalla) => fs.readFileSync(path.join(__dirname, rutaPantalla), 'utf8'));
      //
      // Se sacan los comentarios antes de buscar. El primer intento filtraba
      // las líneas que empezaban con `*`, y falló contra su propio caso: el
      // comentario que explica por qué se sacó qrserver está dentro de un
      // bloque JSX, donde las líneas no llevan asterisco. Un test que confunde
      // una explicación con el problema que explica no sirve para nada.
      const pantalla = pantallas.join('\n');
      const sinComentarios = pantalla.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
      const enCodigo = sinComentarios.split('\n').filter((l) => l.includes('qrserver'));
      assert.strictEqual(
        enCodigo.length,
        0,
        `la pantalla volvió a mandarle el código a un servicio ajeno:\n${enCodigo.join('\n')}`
      );
      assert.ok(
        pantalla.includes('src={qrImagen}') || pantalla.includes('src={wa.qrImagen}'),
        'la pantalla dejó de usar la imagen del propio servidor'
      );
      console.log('  ✓ la pantalla usa la imagen propia, sin servicios de afuera\n');

      console.log('✅ Vinculación de WhatsApp: el código no sale del sistema\n');
    }
  );
}

if (require.main === module) {
  run().catch((error) => {
    console.error('❌', error.message);
    process.exitCode = 1;
  });
}

module.exports = { run };
