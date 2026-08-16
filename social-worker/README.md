# Worker local de Modo Sabor Social

1. Ejecutá `npm install` una única vez dentro de esta carpeta.
2. Copiá `.env.example` a `.env`, configurá `SOCIAL_WORKER_KEY` y `SOCIAL_API_URL`.
3. Abrí `abrir-chrome-social.cmd`, iniciá sesión normalmente en Facebook y dejá Chrome abierto.
4. Abrí `iniciar-worker.cmd`.

El worker nunca lee ni guarda cookies. Sólo controla la ventana Chrome ya iniciada por el operador. Si Facebook pide un checkpoint, CAPTCHA o aprobación, se detiene y lo informa; esa acción debe completarla una persona.

El CDP se expone únicamente en `127.0.0.1:9222`; no cambies esa dirección por una IP pública.
