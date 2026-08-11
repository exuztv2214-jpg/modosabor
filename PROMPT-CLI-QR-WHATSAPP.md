# Prompt para Claude CLI — el QR de WhatsApp deja de salir del sistema

> Un commit, cinco archivos. **Trae una dependencia nueva** (`qrcode`), que es
> la primera de esta tanda: si el deploy falla, mirá ahí primero.

Copiá desde acá abajo.

---

Trabajás en `D:\Proyectos\modosabor1`, el sistema de un restaurante en
producción. Si un paso falla, **pará y contame** con el error completo.

## Qué se arregló

En Marketing → WhatsApp no aparecía el código para vincular el número. Al
buscar por qué, el problema resultó ser peor que la pantalla en blanco.

El QR se dibujaba pidiéndole la imagen a un servicio ajeno:

```jsx
<img
  src={`https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(qr)}`}
/>
```

Ese código no es un dibujo cualquiera. **Es la credencial de vinculación**:
quien lo tenga, mientras está vigente, puede vincular su propio teléfono al
WhatsApp del local y quedarse adentro —leer todas las conversaciones con los
clientes y escribir en nombre del negocio—. Y viajaba en la URL, o sea que
quedaba escrito en los registros de ese servicio y de cualquiera en el camino.

Ahora se dibuja en el propio servidor con `qrcode` —JavaScript puro, sin
compilación— y viaja como imagen embebida en la respuesta. El código no sale
nunca del sistema.

Se descartaron antes, una por una, las otras explicaciones de por qué no
aparecía: los permisos (el rol admin tiene todos), Baileys (está declarado e
instalado), el montaje de la ruta (está en `/api/whatsapp`) y la política de
contenido (permite imágenes externas). Puede que el servicio de afuera
estuviera caído o lento — que es justamente el otro motivo para no depender de
él.

### Cómo se verificó

Se dibujó un código de vinculación real de Baileys, de 231 caracteres, y sale
una imagen PNG de 6 KB. Después se reintrodujo el problema de cinco formas
distintas; las agarra a todas:

```
1. Vuelve el servicio de afuera en la pantalla     AGARRADO
2. La ruta vuelve a mandar el codigo crudo         AGARRADO
3. /estado deja de dibujarlo                       AGARRADO
4. /conectar deja de dibujarlo                     AGARRADO
5. La pantalla deja de usar la imagen propia       AGARRADO
```

El test falló dos veces antes de quedar bien, y las dos valen la pena:

- La primera versión confundía el comentario que explica por qué se sacó
  `qrserver` con el problema que explica. Ahora saca los comentarios antes de
  buscar.
- La segunda se conformaba con que la palabra `qrImagen` apareciera en el
  archivo. Al sacarle el dibujo a `/estado` siguió en verde, porque la palabra
  seguía en `/conectar`. Ahora cuenta que se use en los dos lugares.

**Lo que NO se pudo probar:** el arranque del servidor con la dependencia
nueva. El entorno donde se hizo el cambio no puede abrir la base
(`better-sqlite3` está compilado para Windows). Por eso el paso 2 de abajo es
importante.

## PARTE 1 — Verificación

1. ```
   npm run lint
   npm --prefix server test
   cd client && npm run build && cd ..
   ```

   Esperado: **0 errores** de lint, todos los tests pasando —incluido
   `qrWhatsapp`, que es nuevo— y build limpio.

2. **El arranque, que es el paso que falta cubrir.** La dependencia nueva se
   carga al levantar la ruta, así que si algo está mal aparece acá:

   ```
   cd server
   node -e "require('./index.js')"
   cd ..
   ```

   Cortalo a los pocos segundos. `EADDRINUSE` está bien. **Cualquier error que
   mencione `qrcode` o `Cannot find module`, pará y contame.**

3. Confirmá que la dependencia quedó anotada:
   ```
   node -e "console.log(require('./server/package.json').dependencies.qrcode)"
   ```
   Tiene que imprimir una versión, no `undefined`.

## PARTE 2 — Commit

4. En el repo hay otras cosas sueltas —auditorías, prompts, `aufitoria kilo`,
   el logo optimizado—. **Sólo van estos cinco archivos:**

   ```
   git add server/routes/whatsappMasivo.js client/src/pages/Marketing/MarketingWhatsapp.jsx server/package.json server/package-lock.json server/tests/utils/qrWhatsapp.test.js
   git status --short
   ```

5. ```
   git commit -F - <<'EOF'
   whatsapp: el codigo para vincular deja de salir del sistema

   En Marketing -> WhatsApp no aparecia el QR para vincular el numero. Al
   buscar por que, el problema resulto peor que la pantalla en blanco: el
   codigo se dibujaba pidiendole la imagen a api.qrserver.com, pasandoselo
   por la URL.

   Ese codigo no es un dibujo cualquiera. Es la credencial de vinculacion:
   quien lo tenga, mientras esta vigente, puede vincular su propio telefono
   al WhatsApp del local y quedarse adentro, leyendo todas las
   conversaciones con los clientes y escribiendo en nombre del negocio.
   Viajaba en la URL, asi que quedaba en los registros de ese servicio y de
   cualquiera en el camino. Fue una comodidad de cinco minutos con la llave
   del negocio adentro.

   Ahora se dibuja en el propio servidor con qrcode —JavaScript puro, sin
   compilacion— y viaja como imagen embebida. El codigo no sale del
   sistema. Los dos endpoints que devuelven el estado de la sesion,
   /estado y /conectar, mandan la imagen y borran el codigo crudo.

   Se descartaron antes las otras explicaciones de por que no aparecia: los
   permisos (admin los tiene todos), Baileys (declarado e instalado), el
   montaje de la ruta y la politica de contenido. Puede que el servicio de
   afuera estuviera caido, que es justamente el otro motivo para no
   depender de el.

   Verificado dibujando un codigo real de Baileys de 231 caracteres, y
   reintroduciendo el problema de cinco formas distintas: las agarra a las
   cinco. El test fallo dos veces antes de quedar bien; la segunda se
   conformaba con que la palabra qrImagen apareciera en el archivo y seguia
   en verde con /estado roto.
   EOF
   ```

6. ```
   git show --stat HEAD
   git status --short
   git push origin main
   ```

   `git show --stat HEAD` tiene que listar **exactamente cinco** archivos. Si
   aparece alguno más, **pará y contame**.

7. Esperá el deploy y verificá:

   ```
   railway status
   curl -s --ssl-no-revoke -o NUL -w "%{http_code}" https://modosabor-api-production.up.railway.app/api/health
   ```

   **Si el deploy queda en rojo, lo más probable es la dependencia nueva.**
   Traeme los logs de la etapa de construcción.

## Lo que NO tenés que hacer

- **No uses `git add -A` ni `git add .`**
- **No borres** `diagnostico-asistente.js` ni `aufitoria kilo`
- **No conectes** WhatsApp ni escanees el QR: eso lo hace hernan
- **No toques** `server/db/modosabor.db` ni los respaldos de `.tmp/`
- **No reescribas** el historial de git

## Al terminar

Contame lint, tests, build, **el arranque del servidor** y si el deploy quedó
verde.

---

## Para hernan, después del deploy

Entrá a **Marketing → WhatsApp** y tocá **"Generar el código"**. Tiene que
aparecer el cuadrado del QR en pantalla. Escaneálo desde el WhatsApp del local:
Ajustes → Dispositivos vinculados → Vincular dispositivo. Se hace una sola vez;
la sesión queda guardada en el servidor y sobrevive a los deploys.

Si aún así no aparece, abrí la consola del navegador (F12 → Console), sacá una
foto del error y mandámela. Con el error concreto lo resuelvo; sin él seguiría
adivinando.
