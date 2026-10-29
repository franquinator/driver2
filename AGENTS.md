# AGENTS.md

Prototipo de juego de conducción 3D ("Driver 2") en JS vanilla + Three.js + Rapier. Código, comentarios, UI y README están en español: mantén ese idioma.

## Ejecutar / verificar
- No hay `package.json`, build, linter ni tests. No ejecutes `npm install` ni añadas bundlers salvo petición explícita.
- Servir por HTTP (no funciona con `file://` por los módulos ES): `python -m http.server 8000` → http://localhost:8000/. Requiere Internet (Three.js y Rapier por CDN) y WebGL.
- La única verificación es el navegador. El loop usa `requestAnimationFrame`, que no corre en pestañas ocultas: para probar física sin ventana visible, importa los módulos (`/js/utils/Physics.js`, `/js/entities/*.js`) desde la consola, llama a `await Physics.init()` y avanza pasos a mano (`vehicle.applyControls(input, dt)` + `physics.world.step(physics.eventQueue)`).

## Wiring
- El `importmap` de `index.html` fija `three@0.160.0` (`three` y `three/addons/`) y `@dimforge/rapier3d-compat@0.21.0` (`dist/rapier.mjs`, WASM incluido). Importa siempre por esos nombres.
- Rapier es asíncrono: `main.js` hace `await Engine.create()`, que llama a `Physics.init()` antes de crear nada físico.
- `AudioEngine` (`js/utils/AudioEngine.js`) genera proceduralmente (Web Audio API) el sonido del motor (osciladores + filtro paso-bajo modulados por RPM) y los choques (ruido + subgraveso); el motor se actualiza desde `_updateEngineSound()` en el bucle y los choques desde `_onContactForce()`. El contexto se reanuda en `_onFirstInteraction()`.
- `Physics` (`js/utils/Physics.js`) envuelve el `RAPIER.World` con paso fijo (`CONFIG.PHYSICS.TIMESTEP`) y acumulador. Por cada paso: callback de controles del vehículo → `world.step(eventQueue)` → eventos de fuerza de contacto (daño).
- `City` mete todos los colisionadores estáticos (suelo, aceras, edificios, muros de borde invisibles) en un único cuerpo fijo.
- `Vehicle` = chasis dinámico + `DynamicRayCastVehicleController`, ruedas 0-1 delanteras (dirección), 2-3 traseras (tracción, freno de mano). La malla se sincroniza desde la física en `syncMesh()`.
- Toda la configuración está en `js/config.js`: perfiles en `CONFIG.VEHICLES` (orden de teclas 1–4 en `VEHICLE_ORDER`), `DAMAGE`, `CONTROLS`, `PHYSICS`, `AUDIO`. La carpeta `js/config/` está vacía y no se usa.
- El HUD (`#speed-value`, `#vehicle-name`, `#damage-fill`) se actualiza en `main.js` con `setInterval` a 30 FPS, no en el loop del motor.
- `SettingsPanel` (`js/core/SettingsPanel.js`) genera categorías y campos desde las rutas dentro de `CONFIG` (números y booleans; label desde la ruta). Cambios → `Engine._onConfigChange()` (deep set + localStorage + hot apply). El panel se abre/cierra con botón flotante y panel deslizante; el botón `RESET` → `Engine._resetConfig()` restaura defaults y limpia el `localStorage`.

## Gotchas
- Ejes: +Z adelante, +Y arriba, +X a la izquierda. `getYaw() = 0` mira a +Z; girar a la izquierda suma yaw. `CAMERA.OFFSET.Z` es negativo (detrás).
- Rapier por defecto usa X como eje de avance; se cambia con `controller.setIndexForwardAxis = 2` (es un setter, se asigna). El eje de rueda `(-1,0,0)` con suspensión `(0,-1,0)` es lo que da avance hacia +Z.
- Rapier multiplica la rigidez/amortiguación de suspensión por la masa del chasis; `setWheelBrake` es un impulso por paso (se calcula desde `BRAKE_DECEL` en m/s²). `FRONT_GRIP`/`REAR_GRIP` son el "friction slip" (~coeficiente de agarre): trasera < delantera da el sobreviraje.
- Unidades en metros y m/s: km/h = `|currentVehicleSpeed()| * 3.6`.
- Daño: el umbral del evento de contacto es `MASS * MIN_IMPACT / TIMESTEP`; el impacto se estima como `totalForceMagnitude * dt / MASS`.
- Las calles están centradas en `k * (BLOCK_SIZE + STREET_WIDTH) - halfGrid`; usa `city.getNearestIntersection()` para colocar vehículos. En el centro de cada manzana hay callejones de 3 m entre edificios por los que cabe un coche.
- Los edificios se generan con `Math.random()` sin semilla: la ciudad cambia en cada recarga.
