# Lo que falta — para Codex

Contexto: ya se hizo commit, push y deploy (`a8dbbab4`, Railway SUCCESS).
Falta cerrar cuatro cosas. Van en este orden y **con freno entre cada una**.

Reglas que valen para todo el trabajo:

- **No uses `git add -A`, `git add .` ni `git commit -a`.** Los archivos se
  agregan uno por uno. En la raíz hay bases de n8n con 4 credenciales cada una;
  ya están en `.gitignore`, pero si ves algún `.sqlite` en verde, **pará y avisá**.
- No toques `client/src/pages/Delivery.jsx`, la app del repartidor ni `mozo-app/`.
- No corras "recalcular niveles", `upsertMenuDelDia.js` ni `seedMenuManana.js`.
- No escribas API keys ni contraseñas en ningún archivo del repo.
- **No inventes precios.** Si un dato falta, preguntá.

---

## 1. Commit del archivo de reglas

`REGLAS-CHISPITA.md` quedó modificado después del último commit: la sección
final decía una sola lista de salsas para tres platos, y en realidad son dos
listas y cinco platos.

```
git add REGLAS-CHISPITA.md
git commit -m "REGLAS-CHISPITA: corregir la seccion de pastas, son dos listas y cinco platos"
git push origin main
```

No agregues `server/uploads/whatsapp-carta/Carta Modo Sabor.pdf`. Son 11 MB y
se decide aparte.

**Pegá el resultado y seguí.**

---

## 2. Reiniciar el gateway de WhatsApp

Whisper pasó de `base` a `small` para transcribir mejor los audios de los
clientes, pero el cambio no toma efecto hasta reiniciar el gateway.

Averiguá cómo se levanta en esta máquina (mirá `deploy/ecosystem.config.js`,
los scripts de `server/package.json` y `ModoSabor.pyw`), **decime el comando
exacto que pensás correr y esperá mi OK antes de correrlo.**

No reinicies nada sin confirmarme primero: si hay pedidos entrando, el corte
se nota.

Después de reiniciar, verificá en el log que arranque con el modelo `small`.

---

## 3. Cargar las pastas en producción

**Esto es lo delicado. Leelo entero antes de tocar nada.**

Las cinco pastas existen sólo en la base local. La base no viaja con el deploy:
está en `.gitignore` y en producción vive en un volumen de Railway
(`DATA_DIR`/`DB_FILE` en `server/utils/storagePaths.js`).

Hay dos scripts ya escritos, probados y commiteados:

```
server/scripts/cargarPastas.js    crea las 2 listas de salsas y los 5 platos
server/scripts/activarPastas.js   les pone precio y los activa
```

Los dos son idempotentes, hacen backup solo antes de escribir, y sin
`--aplicar` sólo imprimen qué harían.

**Primero averiguá si podés llegar a la base de producción**, por ejemplo con
`railway ssh` (hay un `deploy/railway-vars.bat`, así que la CLI debería estar
configurada).

- **Si NO podés llegar**: decímelo y frená. Las cargo yo a mano desde el panel.
- **Si SÍ podés**: corré primero, en el contenedor de producción:

  ```
  node server/scripts/cargarPastas.js
  node server/scripts/activarPastas.js
  ```

  **Sin `--aplicar`.** Pegame las dos salidas y **frená ahí**. No corras el
  `--aplicar` hasta que yo escriba "dale".

Los precios están en centavos a propósito: 700000 son $7.000. No los
"corrijas" a 7000, eso dejaría los platos a $70.

Así tienen que quedar:

| Plato          | Precio | Salsa (obligatoria)                 |
| -------------- | ------ | ----------------------------------- |
| Canelones      | $5.000 | blanca · roja · mixta               |
| Lasaña         | $7.000 | blanca · roja · mixta               |
| Ñoquis         | $5.000 | fileto con pollo · fileto con carne |
| Fideos caseros | $5.000 | fileto con pollo · fileto con carne |
| Ravioles       | $7.000 | fileto con pollo · fileto con carne |

Un detalle: en producción el **Canelones** probablemente ya exista con las tres
salsas escritas a mano adentro de un grupo llamado "Guarnición". El script lo
detecta y le saca ese grupo repetido, pero **sólo si las opciones son
exactamente las tres**. Si tuviera una salsa distinta o una de más, lo deja
intacto y hay que arreglarlo a mano desde el panel — si no, el mozo tiene que
elegir salsa dos veces.

---

## 4. Verificación final

Una vez cargadas, verificá **contra la base de producción** (no contra la
local) que:

- los cinco platos estén `activo = 1`
- los precios en centavos sean 500000 / 700000, no 5000 / 7000
- no haya ningún producto activo con `precio = 0` en toda la carta
- cada pasta tenga **un solo** grupo de salsas, no dos

Pegame el resultado.

**Ojo con esto**: la base está en modo WAL. Si copiás el archivo para
inspeccionarlo, copiá también `modosabor.db-wal` y `modosabor.db-shm`, o vas a
estar leyendo una foto vieja y vas a reportar que falló algo que en realidad
funcionó. A mí me pasó.

---

## Lo que NO hacés vos

- **Pegar las reglas en Configuración → WhatsApp.** Eso lo hace Hernán desde el
  panel: son dos campos de texto, "Estilo" y "Reglas generales", y el contenido
  está en `REGLAS-CHISPITA.md`.
- **Decidir qué pasa con el PDF de la carta** (11 MB, sin trackear).
- **Conectar WhatsApp o escanear el QR.** Eso lo hace Hernán.
