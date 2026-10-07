import { Engine } from './core/Engine.js';

document.addEventListener('DOMContentLoaded', async () => {
    // 1. Inicializar Rapier, crear y arrancar el motor del juego
    const engine = await Engine.create();
    engine.start();

    // 2. Referencias a los elementos del HUD
    const speedValueElement = document.getElementById('speed-value');
    const vehicleNameElement = document.getElementById('vehicle-name');
    const damageFillElement = document.getElementById('damage-fill');

    // 3. Bucle ligero para actualizar la interfaz a 30 FPS
    setInterval(() => {
        const vehicle = engine.vehicle;
        if (!vehicle) return;

        speedValueElement.textContent = vehicle.getSpeedKmH();
        vehicleNameElement.textContent = vehicle.config.NAME;
        damageFillElement.style.width = `${vehicle.damage.toFixed(0)}%`;
    }, 1000 / 30);
});
