# Instalar la extensión

Una sola vez. Un minuto.

---

## Los pasos

1. Abrí Chrome y andá a **`chrome://extensions`**
   _(copiá eso en la barra de direcciones)_

2. Arriba a la derecha, prendé **"Modo de desarrollador"**

3. Aparecen tres botones nuevos. Apretá **"Cargar descomprimida"**

4. Elegí esta carpeta: **`D:\Proyectos\modosabor1\social-extension`**

5. Listo. Va a aparecer _Modo Sabor Social_ en la lista.

---

## Después

Abrí **Social** en el panel y apretá **"Conectar mis grupos"**.

Eso es todo. No hay claves que copiar, ni direcciones que completar, ni programas que dejar prendidos.

---

## Por qué una extensión y no un programa

Meta cerró la API de grupos en abril de 2024. Desde entonces **ningún servidor** puede publicar en un grupo del que sos miembro — ni el nuestro, ni Buffer, ni Hootsuite, ni Metricool.

La única forma que queda es hacerlo desde un navegador con tu sesión iniciada. Antes eso era un programa aparte que había que instalar, configurar y mantener prendido. Ahora vive adentro del Chrome que ya tenés abierto.

De paso, publica desde tu IP y tu sesión de siempre, que es más seguro para la cuenta que hacerlo desde un servidor.

---

## Lo que la extensión puede y no puede ver

**Puede:** abrir Facebook en una pestaña de fondo, leer la lista de tus grupos, y escribir una publicación cuando el panel se lo pide.

**No puede:** leer tus mensajes, ver otras páginas que visites, ni mandar nada a ningún lado que no sea tu propio panel. En `manifest.json` está limitada a Facebook y a los dominios de Modo Sabor — se puede leer, son treinta líneas.

---

## Si algo no anda

Hacé clic en el ícono de la extensión, al lado de la barra de direcciones. Te va a decir en castellano qué está pasando:

- **"Falta vincularla con tu panel"** → andá a Social y apretá "Conectar mis grupos"
- **"Vinculada, pero algo falló"** → te dice el motivo exacto
- **"Conectada y trabajando"** → está todo bien

---

## Cuando actualicemos la extensión

Volvé a `chrome://extensions` y apretá el botón de recargar (↻) en la tarjeta de _Modo Sabor Social_. No hace falta volver a vincular.
