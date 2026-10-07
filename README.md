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
- `js/main.js` y `js/config.js`: inicio y ajustes (física, perfiles de vehículo, daño y teclas).
- `js/core/`: motor, cámara y teclado; `js/entities/`: vehículo (controlador de vehículo de Rapier) y ciudad; `js/utils/Physics.js`: mundo de Rapier con paso fijo.

**Limitaciones:** edificios sin optimizar para mapas grandes; el daño solo se ve en la barra y en el color de la carrocería.
