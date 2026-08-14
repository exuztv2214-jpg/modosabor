# Prompt para Claude CLI — continuar Modo Sabor

Copiá todo lo que está debajo de la línea y pegalo como primer mensaje.

---

Trabajás en **Modo Sabor**, el sistema de un restaurante real en Monteros,
Tucumán. El dueño se llama Hernán y **está usándolo con clientes de verdad**:
un error acá no es un test que falla, es una comanda que no sale o plata que se
cobra mal.

Hablame siempre en **castellano rioplatense**, con voseo.

## Reglas que no se negocian

- **Nunca `git add -A`** en este repo. Agregá archivo por archivo.
- **No reescribas la historia de git.** Hubo credenciales filtradas; se rotan,
  no se reescribe.
- **No escribas claves ni contraseñas en archivos del repo.** Las rota él.
- **No toques** `client/src/pages/Delivery.jsx` ni los archivos de la app del
  rider ni de `mozo-app/`: los trabaja Codex en paralelo y commitea seguido.
- **No corras** `upsertMenuDelDia.js` ni `seedMenuManana.js`: reemplazan el
  menú vivo en pleno servicio.
- **No generes un keystore de Android nuevo**: rompe las actualizaciones de la
  app del rider.
- No borres `diagnostico-asistente.js` ni la carpeta `aufitoria kilo` sin
  preguntar.
- El QR de WhatsApp lo escanea él. No intentes conectar WhatsApp.

## Cómo se trabaja acá

**Verificá antes de afirmar.** Si vas a decir "esto está roto", abrí el archivo
y leelo. Ya pasó varias veces de construir una teoría entera sobre una
suposición y estar equivocado. Si no podés comprobar algo, decí que no podés.

**Probá cada arreglo rompiéndolo a propósito.** Escribí el test, hacelo pasar,
después volvé a meter el bug y confirmá que el test lo agarra. Un test que pasa
igual con el bug adentro no sirve. Ya pasó tres veces que un chequeo se
enganchara con un **comentario** en vez de con código: sacá los comentarios
antes de buscar texto en un archivo.

**Los comentarios explican por qué, no qué.** Contá el error real que se
cometió y qué pasaba en el local por su culpa. Mirá los archivos que ya están
—`server/utils/opcionesCompartidas.js`, `server/tests/utils/*.test.js`— y
seguí ese tono.

**La plata va en centavos.** Toda. `moneyConversion.js` convierte por nombre de
campo y **sólo números, no texto**. Los formularios multipart esquivan el
conversor: si una ruta recibe `FormData` con plata, hay que convertir a mano.
Este error ya se comió el módulo de Personal entero y el seed del menú del día.

**Las fechas son UTC-3 fijo.** Usá `utils/fechaLocal.js`. El servidor corre en
UTC y Tucumán no cambia de horario.

## Cómo verificar

```bash
cd server && node tests/run.js                       # tests
cd server && node scripts/verificarListasOpciones.js # SQL contra base real
cd client && npx eslint src && npm run build
```

`railway run` corre **local**, no en el servidor: da diagnósticos falsos. Para
producción hace falta `railway ssh` o la terminal web de Railway.

## Estado: nada de esto está commiteado

Se hizo en una sesión larga y está todo sin commitear ni deployar. El push lo
hace Hernán.

**Listas de opciones compartidas** (`opcion_listas`, `opcion_items`,
`producto_opcion_listas`): guarniciones, salsas, agregados y postres cargados
una vez y asignados a muchos platos. Se **mezclan adentro de
`productos.variantes` y `extras` al leer**, así que el TPV, la web, el rider y
la cocina no se enteraron. Pantalla en Catálogo → Listas de opciones.

**Menú del día**: pantalla propia nueva (`client/src/pages/MenuDelDia.jsx`) con
una tarjeta por plato y **dos precios, económico y ejecutivo**, porque el mismo
plato puede salir en las dos porciones el mismo día. Columnas nuevas
`precio_economico` y `precio_ejecutivo` en `menu_dia_historial`. La pantalla
vieja de Operación **sigue funcionando a propósito**: no la saques hasta que
Hernán use la nueva unos días.

**WhatsApp / IA**: el cerebro está en **n8n** (`127.0.0.1:5678`), fuera del
repo y sin versionar. Este repo maneja conexión, transcripción, contexto y
protecciones. Se arregló que la IA confirmara pedidos inexistentes —usaba el
número que ella misma inventaba como prueba— y ahora la ficha del cliente viaja
en el mensaje. El catálogo manda **cada opción con su precio real**; antes
mandaba sólo el más barato y cotizaba una pizza de $11.000 a $5.500.

**Alarmas**: el socket se rendía a los 5 segundos y dejaba la pestaña muda para
siempre. Ahora reintenta indefinidamente y se despierta al volver la pestaña,
la red o el foco.

**Otros**: alta de clientes desde el TPV; un pedido ya no le borra el nombre ni
la dirección a un cliente; `tests/run.js` no ejecutaba 7 tests y los contaba
como aprobados.

## Lo que falta, en orden

1. **Correr el corrector de precios.** Ocho platos del menú del día están
   cargados en pesos dentro de una columna de centavos: se venden a $50 y $70
   en vez de $5.000 y $7.000. Están `activo=1`.

   ```
   node server/scripts/corregirPreciosMenuDia.js            # sólo mira
   node server/scripts/corregirPreciosMenuDia.js --aplicar  # corrige
   ```

2. **Cargar canelones, ñoquis y fideos a la carta** como productos fijos, con
   una lista compartida _Salsas_. Los clientes los pidieron 41, 55 y 12 días
   distintos; el menú del día tiene 4 días cargados en toda su historia. Hoy el
   bot no los puede vender.

3. **Migrar los agregados de hamburguesa.** Los mismos cuatro están copiados en
   16 platos. Crear la lista, asignarla a la categoría, y **después borrar los
   viejos de cada plato** o quedan duplicados en pantalla.

4. **Que derivar a una persona avise.** Hoy sólo escribe una marca en la base:
   sin sonido, sin cartel, y no hay pantalla de conversaciones —lo único que
   existe es una lista de las últimas doce adentro de Configuración—. Hubo un
   cliente esperando 42 minutos. Y la derivación **se cancela sola a los 30
   minutos** aunque nadie haya contestado.

5. **`WHISPER_MODEL=small`** (hoy `base`). Los audios se transcriben mal:
   "cuánto cueste lo mito" por "cuánto cuesta el lomito". Es una variable de
   entorno, sin deploy.

6. **Duplicados en el menú del día**: _Canelón_ y _Canelones_, _Suprema a la
   napolitana_ y _Suprema napolitana_, _Wok de verduras y pollo_ y _con pollo_.
   Seis platos que son tres.

## Datos útiles que ya se averiguaron

- La regla de las pizzas: **mitad = entera ÷ 2 + $500**. Se cumple en 16 de 17.
  La única fuera de regla es _Napolitana Especial_ media muzza: está a $5.500 y
  debería estar a $6.000.
- Hay un backup de 41.969 mensajes reales de WhatsApp en
  `D:\Proyectos\BackupWhatsAppChats\exports\whatsapp-para-analisis-*.json`.
  Sirve para sacar cómo pide la gente de verdad.
- Las reglas del agente están escritas en `REGLAS-CHISPITA.md`, listas para
  pegar en Configuración → WhatsApp. No necesitan deploy.
