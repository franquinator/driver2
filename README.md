# Driver 2 — prototipo

Juego de conducción 3D con JavaScript, Three.js y físicas de [Rapier](https://rapier.rs/) (ambos cargados desde CDN); no requiere instalar paquetes.

## Ejecutar

Servir la carpeta con Live Server o, si tienes Python, ejecutar `python -m http.server 8000` y abrir <http://localhost:8000/>. Requiere Internet y WebGL; no funciona con `file://`.

**Controles:**

- WASD o flechas: acelerar, frenar / marcha atrás y girar.
- Espacio: freno de mano (bloquea las ruedas traseras para derrapar).
- R: reiniciar el vehículo (vuelve al punto de inicio, velocidad cero y daño a 0).
- 1–4: cambiar de vehículo (muscle car, patrulla, camión, autobús).

## Estructura

- `index.html` y `css/style.css`: página y HUD (velocidad, vehículo y daño).
- `js/main.js` y `js/config.js`: inicio y ajustes (física, perfiles de vehículo, daño, audio y teclas).
- `js/core/`: motor, cámara, teclado y audio (`AudioEngine`); `js/entities/`: vehículo (controlador de vehículo de Rapier) y ciudad; `js/utils/`: `Physics.js` (mundo de Rapier) y `AudioEngine.js` (sonidos procedurales).

**Limitaciones:** edificios sin optimizar para mapas grandes; el daño solo se ve en la barra y en el color de la carrocería.

## Audio

Los sonidos se generan proceduralmente en tiempo real con la Web Audio API (`js/utils/AudioEngine.js`) — no se usan archivos de audio:

- **Motor:** dos osciladores 'sawtooth' con filtro paso-bajo modulados por el RPM del vehículo (frecuencia, filtro y ganancia se actualizan cada frame según el acelerador).
- **Choques:** burst de ruido blanco filtrado + subgraveso con caída de frecuencia, con intensidad proporcional a la velocidad del impacto.

Los parámetros (volumen maestro, régimen/ganancia/frecuencias del motor y de choque) están centralizados en `CONFIG.AUDIO` (`js/config.js`) para ajustarlos sin tocar código.

- El audio se crea al iniciar el juego y se reanuda tras la primera interacción del usuario (política de autoplay de los navegadores).
- Si no se oye el motor o los choques, revisar el volumen maestro (`CONFIG.AUDIO.MASTER_VOLUME`) y el volumen del sistema.
