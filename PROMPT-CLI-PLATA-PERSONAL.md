# Prompt para Claude CLI — la plata de Personal en centavos

> Un commit y **una migración de datos**. La migración obliga a simular primero
> y hay que mirar la salida antes de aplicarla: es plata de la gente que
> trabaja ahí.

Copiá desde acá abajo.

---

Trabajás en `D:\Proyectos\modosabor1`, el sistema de un restaurante en
producción. Si un paso falla, **pará y contame** con el error completo.

## Qué estaba roto

El módulo de Personal guardaba la plata en **pesos**, mientras el resto del
sistema la guarda en **centavos**.

La causa: el conversor de la API multiplica por cien lo que entra, pero **sólo
mira los números**. Los formularios de Personal mandan texto, porque son campos
donde se escribe "150.000" con separador de miles:

```js
pesosToCents({ monto_base: 150000 })    → 15000000   (número: convierte)
pesosToCents({ monto_base: '150000' })  → '150000'   (texto: lo deja pasar)
```

Ese texto seguía de largo, la ruta lo interpretaba con `roundLocalizedNumber`
—que devuelve pesos— y lo guardaba tal cual en columnas de centavos.

Se veía en la ficha del empleado: "$100" donde se habían cargado $10.000. Pero
lo grave era otra cosa. Al liquidar, ese número se inserta en
`caja_movimientos.monto`, que **sí** está en centavos:

```js
INSERT INTO caja_movimientos (..., monto, ...) VALUES (..., montoNeto, ...)
```

**La caja registraba los pagos al personal cien veces más chicos de lo que se
pagó.** Un sueldo de $150.000 entraba como una salida de $1.500.

## Qué se hizo

**Una función nueva**, `pesosACentavos`, en `server/utils/numberInput.js`, junto
a las otras funciones de números. Cuatro lugares de `routes/personal.js` la
usan: el alta y la edición del sueldo, los movimientos (adelantos, descuentos,
consumos) y el premio de un objetivo.

**Vive en utils y no adentro de la ruta a propósito.** La primera versión estaba
en `personal.js` y el test tenía una copia; al probarlo rompiendo la
multiplicación, el test siguió en verde porque estaba midiendo su propia copia.
Ahora hay una sola.

**Se cuidó el error inverso.** En dos lugares el valor cae de vuelta a lo que ya
está guardado (`existing.monto_base`), que ya está en centavos. Multiplicarlo
otra vez sería el mismo error al revés, y de esos tampoco avisa nadie:

```js
const montoBase =
  req.body?.monto_base === undefined || req.body?.monto_base === null
    ? Number(existing.monto_base || 0) // ya en centavos
    : pesosACentavos(req.body.monto_base); // del formulario, en pesos
```

**No se tocaron las cantidades ni los porcentajes.** `unidades`, `objetivo`,
`progreso`, `cantidad` y `descuento_empleado_pct` se escriben igual pero no son
plata. Multiplicar un porcentaje por cien no da un número raro: da uno plausible
y equivocado.

**`personal_categorias.sueldo_base_minimo` quedó afuera** a propósito: el
conversor tampoco lo reconoce como plata al leerlo, así que entra y sale en
pesos y es coherente consigo mismo. Tocarlo sin tocar también el conversor lo
rompería.

### Cómo se verificó

El test se validó reintroduciendo el error de seis formas. Las agarra a todas:

```
1. El sueldo vuelve a guardarse en pesos          AGARRADO
2. Los adelantos vuelven a pesos                  AGARRADO
3. El premio del objetivo vuelve a pesos          AGARRADO
4. Se convierte 'unidades', que no es plata       AGARRADO
5. La conversión multiplica por 10 en vez de 100  AGARRADO
6. Se convierte dos veces                         AGARRADO
```

Los casos 5 y 6 son los que se escapaban cuando el test tenía su propia copia
de la función.

## PARTE 1 — Verificación del código

1. ```
   npm run lint
   npm --prefix server test
   cd client && npm run build && cd ..
   ```

   Esperado: **0 errores** de lint, todos los tests pasando —incluido
   `plataPersonal`, que es nuevo— y build limpio.

2. ```
   cd server && node -e "require('./index.js')" && cd ..
   ```
   Cortalo a los pocos segundos. `EADDRINUSE` está bien.

## PARTE 2 — La migración de los datos

El código ya guarda bien. Falta corregir lo que quedó escrito antes.

3. **Simulá primero.** El script no escribe nada sin `--aplicar`:

   ```
   node server/scripts/migrarPlataPersonalACentavos.js
   ```

   **Ojo con dónde corre.** `railway run` ejecuta en la máquina local y abre una
   base vacía —ya nos dio un diagnóstico falso una vez—. Hay que correrlo
   adentro del contenedor: `railway ssh`, o la terminal del servicio en
   railway.app.

   El script se defiende solo: si la base no tiene pedidos, corta y avisa que
   esa no es la base del negocio.

4. **Mirá la salida y contámela antes de aplicar.** Imprime, para cada importe:
   el valor crudo, cómo se ve hoy, y cómo se vería después.

   - Si los de **"va a verse"** son los sueldos y adelantos de verdad → la
     migración es correcta, seguí.
   - Si los de **"hoy se ve"** ya eran los correctos → **NO la apliques**: los
     datos estaban bien y esto los rompería. Pará y contame.

   Este cuidado no es de más: este mes ya se escribió una migración de los
   `extras` a centavos razonando desde el código, y los datos decían que ya
   estaban en centavos. Habría multiplicado por cien plata que estaba bien.

5. Recién con la confirmación:

   ```
   node server/scripts/migrarPlataPersonalACentavos.js --aplicar
   ```

   Hace un respaldo de la base antes de tocar nada, y si algo falla vuelve todo
   atrás.

6. Abrí una ficha en el panel: el sueldo tiene que verse como se cargó, no cien
   veces más chico.

## PARTE 3 — Commit

7. Sólo estos cuatro archivos. En el repositorio hay otras cosas sueltas
   —`server/index.js` con un traductor de errores a medias,
   `server/utils/erroresDeBase.js`, varios `.md`—: **todo eso queda afuera.**

   ```
   git add server/utils/numberInput.js server/routes/personal.js server/tests/utils/plataPersonal.test.js server/scripts/migrarPlataPersonalACentavos.js
   git status --short
   ```

8. ```
   git commit -F - <<'EOF'
   personal: la plata se guardaba en pesos donde el sistema espera centavos

   La ficha mostraba "$100" donde se habian cargado $10.000, y al liquidar
   ese numero se insertaba en caja_movimientos.monto, que si esta en
   centavos: la caja registraba los pagos al personal cien veces mas
   chicos de lo que se pago.

   El conversor de la API multiplica por cien lo que entra, pero solo mira
   los numeros. Los formularios de Personal mandan texto, porque son campos
   donde se escribe "150.000" con separador de miles, asi que pasaban de
   largo. La ruta los interpretaba con roundLocalizedNumber —que devuelve
   pesos— y los guardaba tal cual.

   Ahora hay una funcion pesosACentavos en utils/numberInput, que usan los
   cuatro lugares de plata: alta y edicion del sueldo, movimientos y premio
   de objetivo. Vive en utils y no en la ruta porque la primera version
   estaba adentro de personal.js y el test tenia una copia: al probarlo
   rompiendo la multiplicacion, el test siguio en verde midiendo su propia
   copia.

   Se cuido el error inverso: donde el valor cae de vuelta a lo ya guardado
   se usa tal cual, porque eso ya esta en centavos y multiplicarlo otra vez
   es el mismo error al reves. Y las cantidades y porcentajes no se tocan:
   multiplicar un porcentaje por cien no da un numero raro, da uno
   plausible y equivocado.

   Validado reintroduciendo el error de seis formas distintas: las agarra a
   las seis, incluidas las dos que se escapaban cuando el test tenia copia
   propia.

   Va con un script de migracion para lo ya guardado, que obliga a simular
   antes de escribir y respalda la base antes de tocarla.
   EOF
   ```

9. ```
   git show --stat HEAD
   git status --short
   git push origin main
   railway status
   ```

   `git show --stat HEAD` tiene que listar **exactamente cuatro** archivos. Si
   aparece `server/index.js` o `erroresDeBase.js`, se coló trabajo ajeno:
   **pará y contame**.

## Lo que NO tenés que hacer

- **No apliques la migración sin que hernan haya visto la simulación**
- **No uses `git add -A` ni `git add .`**
- **No corras** `upsertMenuDelDia.js` ni `seedMenuManana.js`
- **No conectes** WhatsApp ni escanees el QR
- **No reescribas** el historial de git

## Al terminar

Contame lint, tests, build, arranque, **la salida de la simulación**, y si el
deploy quedó verde.
