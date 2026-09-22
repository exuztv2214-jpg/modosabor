# El bot no contesta nada — para Claude CLI

Modo Sabor, restaurante en Monteros. Repo `D:\Proyectos\modosabor1`, producción
en Railway. **El bot de WhatsApp dejó de responder: ni texto ni audio, silencio
total.**

Lo que ya se descartó:

- El servidor está vivo: `/api/health` responde `ok:true`, `db:true`, y el
  proceso arrancó hace pocos minutos, o sea que el deploy terminó bien.
- WhatsApp figura **conectado** en el panel.
- No es el horario: fuera de turno el bot igual contesta con los horarios.

---

## Reglas que valen para todo

- **No uses `git add -A`, `git add .` ni `git commit -a`.** Archivo por archivo.
  Hay más de 30 archivos sin commitear que son trabajo en curso de otro: **no
  los subas**. Si ves un `.sqlite` en verde, **pará y avisá**.
- **No escribas API keys ni contraseñas en ningún archivo.**
- No toques `client/src/pages/Delivery.jsx`, la app del repartidor ni `mozo-app/`.
- **Todo lo que se corra contra la base tiene que ser adentro de Railway**
  (`railway ssh`). Correrlo desde la carpeta en Windows toca la base local, que
  no es la del bot. Este error ya se cometió dos veces.
- **No reviertas nada sin avisar antes** con el motivo.

---

## 1. La sospecha principal: la conversación quedó silenciada

En `server/services/whatsappGateway.js` hay un único camino que devuelve
silencio sin mandar nada:

```js
if (config.pausaTotal || !config.atencionIa || conversation.pausa_humana) return;
```

Y la herramienta `derivar` del agente marca la conversación así:

```sql
bot_silenciado = 1, escalado_humano = 1, ultimo_estado = 'esperando_humano'
```

Es lo que pasa cuando el agente decide que atienda una persona. Si eso ocurrió
durante las pruebas, el bot quedó mudo para ese número **y no lo va a decir**.

Entrá a Railway y mirá:

```
railway ssh
```

Ya adentro:

```
node -e "const db=require('./server/db'); console.table(db.prepare(\"SELECT telefono, bot_silenciado, escalado_humano, ultimo_estado, datetime(actualizado_en) AS cuando FROM whatsapp_conversaciones ORDER BY actualizado_en DESC LIMIT 8\").all());"
```

**Pegame la tabla y frená.** No cambies nada todavía.

Si aparece `bot_silenciado = 1` o `escalado_humano = 1` en el número que se está
probando, ahí está la causa y el arreglo es despertarlo — pero **esperá el OK**
antes de correr el UPDATE, porque puede haber conversaciones de clientes reales
esperando atención humana de verdad y no hay que despertarlas a todas.

---

## 2. Si no está silenciado, mirá la configuración general

```
node -e "const db=require('./server/db'); console.table(db.prepare(\"SELECT clave, valor FROM configuracion WHERE clave IN ('whatsapp_atencion_ia_activa','whatsapp_pausa_total','whatsapp_motor_propio','transcripcion_gemini_activa')\").all());"
```

Lo esperable: `whatsapp_atencion_ia_activa = 1`, `whatsapp_pausa_total` en cero
o vacío, `whatsapp_motor_propio = 1`.

**Pegame la tabla y frená.**

---

## 3. Si todo está bien ahí, el log del gateway

```
railway logs | tail -60
```

Buscá errores al procesar mensajes. El gateway guarda el último error y lo
muestra en la pantalla de WhatsApp del panel, en el cartel rojo "Último
problema".

**Pegame lo que aparezca.**

---

## 4. El botón de pánico, si hace falta

El último cambio subido movió la transcripción de audio a Gemini, dejando
Whisper de respaldo (commit `888d7c77`). **No debería afectar a los mensajes de
texto** —sólo se toca al recibir un audio—, pero si hace falta descartarlo:

```
node -e "const db=require('./server/db'); db.prepare(\"INSERT INTO configuracion (clave,valor) VALUES ('transcripcion_gemini_activa','0') ON CONFLICT(clave) DO UPDATE SET valor='0'\").run(); console.log('audio de vuelta a Whisper');"
```

Eso no requiere deploy ni reinicio: se lee en cada audio.

**Usalo sólo si los pasos 1 a 3 no explicaron el silencio, y avisá antes.**

---

## Lo que hay que devolver

En este orden y nada más:

1. La tabla de conversaciones
2. La tabla de configuración
3. El log, si hizo falta llegar ahí

Con eso se decide el arreglo. **No arregles nada sin mostrar antes qué encontraste**:
el bot está en producción atendiendo clientes y un UPDATE de más puede despertar
conversaciones que un humano dejó pausadas a propósito.
