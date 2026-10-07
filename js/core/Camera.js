import * as THREE from 'three';

/**
 * Gestor de la cámara en tercera persona (Chase Cam) estilo Driver 2.
 */
export class CameraManager {
    /**
     * @param {Object} config Configuración global (`CONFIG.CAMERA`).
     */
    constructor(config) {
        this.config = config;

        // Crear la cámara de perspectiva de Three.js
        const aspect = window.innerWidth / window.innerHeight;
        this.camera = new THREE.PerspectiveCamera(
            config.FOV,
            aspect,
            config.NEAR,
            config.FAR
        );

        // Posición inicial por defecto
        this.camera.position.set(0, config.OFFSET.Y, config.OFFSET.Z);

        // Multiplicador de distancia según el tamaño del vehículo
        this.scale = 1;

        // Posiciones auxiliares reutilizables para evitar basura en el GC
        this._desiredPosition = new THREE.Vector3();
        this._targetLookAt = new THREE.Vector3();
    }

    /**
     * Actualiza la posición y orientación de la cámara para seguir al vehículo.
     * 
     * @param {THREE.Vector3} targetPosition Posición actual del vehículo.
     * @param {number} targetRotationY Ángulo de rotación (Yaw) del vehículo en Y.
     * @param {number} deltaTime Tiempo transcurrido entre cuadros.
     */
    update(targetPosition, targetRotationY, deltaTime) {
        const offset = this.config.OFFSET;
        const s = this.scale;

        // 1. Calcular el desplazamiento en X y Z relativo a la rotación del vehículo
        const offsetX = Math.sin(targetRotationY) * offset.Z * s;
        const offsetZ = Math.cos(targetRotationY) * offset.Z * s;

        // 2. Definir la posición deseada de la cámara detrás y por encima del auto
        this._desiredPosition.set(
            targetPosition.x + offsetX,
            targetPosition.y + offset.Y * s,
            targetPosition.z + offsetZ
        );

        // 3. Suavizado de seguimiento mediante interpolación lineal (Lerp)
        // Escalamos el factor LERP con deltaTime para mantener la fluidez a distintos FPS
        const lerpFactor = Math.min(1.0, this.config.LERP_FACTOR * deltaTime * 60);
        this.camera.position.lerp(this._desiredPosition, lerpFactor);

        // 4. Orientar la cámara hacia el auto (un poco elevado sobre el centro)
        this._targetLookAt.copy(targetPosition).y += 1.2 * s;
        this.camera.lookAt(this._targetLookAt);
    }

    /**
     * Cambia el multiplicador de distancia (vehículos grandes = cámara más lejos).
     * @param {number} scale
     */
    setScale(scale) {
        this.scale = scale;
    }

    /**
     * Ajusta el aspect ratio de la cámara al redimensionar la ventana.
     * 
     * @param {number} width Ancho del viewport.
     * @param {number} height Alto del viewport.
     */
    onWindowResize(width, height) {
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
    }

    /**
     * Obtiene la instancia interna de THREE.PerspectiveCamera.
     * @returns {THREE.PerspectiveCamera}
     */
    getCamera() {
        return this.camera;
    }
}