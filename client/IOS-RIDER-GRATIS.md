# Modo Sabor Rider en iPhone sin pagar Apple Developer

La app nativa se compila en GitHub Actions como una IPA sin firma. No se guarda
ningún Apple ID, contraseña, certificado ni perfil dentro del repositorio.

## Generar la IPA

1. Abrir GitHub Actions en el repositorio.
2. Elegir `Empaquetar Rider iOS sin firma`.
3. Ejecutar `Run workflow` sobre `main`.
4. Descargar el artefacto `ModoSabor-Rider-iOS-1.3.7-unsigned`.

## Instalar desde Windows sin suscripción paga

La IPA debe firmarse para el iPhone concreto. Puede hacerse con un Apple ID
gratuito usando Sideloadly o AltStore desde Windows. Apple limita el equipo
Personal Team: la firma dura 7 días, admite hasta 3 dispositivos y hasta 3 apps
por dispositivo. Al vencer hay que volver a firmar/instalar.

La cuenta gratuita no permite publicar en App Store ni garantiza las
capacidades avanzadas. En particular, las notificaciones push remotas de iOS
requieren una configuración APNs que normalmente pertenece al programa pago.
La app sigue recibiendo pedidos por socket cuando está abierta y el GPS nativo
funciona durante un reparto si el usuario concede ubicación `Siempre`.

## Alternativa que no vence

Abrir `https://modosabor.com.ar/rider` en Safari, tocar Compartir, elegir
`Agregar a Inicio` y activar `Abrir como app web`. No requiere firma ni cuenta,
pero iOS puede suspender la ubicación cuando la web app queda cerrada.
