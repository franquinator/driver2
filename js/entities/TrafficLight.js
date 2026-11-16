import * as THREE from 'three';
import { CONFIG } from '../config.js';

/**
 * Clase que gestiona un semáforo en una intersección urbana.
 * Controla el estado de la luz (ROJO/AMARILLO/VERDE) y su temporizador.
 */
export class TrafficLight {
    /**
     * @param {number} x Posición X de la intersección (mundo Three.js)
     * @param {number} z Posición Z de la intersección (mundo Three.js)
     */
    constructor(x, z) {
        this.state = 'GREEN'; // Estados: GREEN, YELLOW, RED, RED_YELLOW
        this.timer = 0;
        this.enabled = true;

        // Configuración de duraciones (vienen de CONFIG, pero usamos valores por defecto si no existen)
        this.config = CONFIG.TRAFFIC_LIGHTS;
        this._resetTimer();

        // Posición del semáforo sobre la intersección, elevado sobre el suelo
        this.position = new THREE.Vector3(x, 2.5, z);

        // Crear la malla del semáforo
        this._buildMesh();

        // Aplicar posición al mesh
        this.mesh.position.copy(this.position);
    }

    /**
     * Establece las duraciones por defecto desde la configuración.
     * @private
     */
    _resetTimer() {
        this.greenDuration = this.config.GREEN_DURATION;
        this.yellowDuration = this.config.YELLOW_DURATION;
        this.redDuration = this.config.RED_DURATION;
        this.redYellowDuration = this.config.RED_YELLOW_DURATION;

        this._startNewCycle();
    }

    /**
     * Inicia un nuevo ciclo completo de semáforo.
     * @private
     */
    _startNewCycle() {
        // Secuencia: GREEN -> YELLOW -> RED -> RED_YELLOW -> (repetir)
        this.state = 'GREEN';
        this.timer = 0;
    }

    /**
     * Construye la geometría del semáforo.
     * @private
     */
    _buildMesh() {
        const towerHeight = 2.5;
        const towerWidth = 0.3;
        const lightRadius = 0.15;
        const lightSpacing = 0.6;

        // Material para las lámparas (MeshBasic para que siempre sean visibles)
        this.lightMaterial = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.9 });

        // Torre horizontal del semáforo
        const towerGeo = new THREE.BoxGeometry(towerWidth, towerHeight, towerWidth);
        const towerMat = new THREE.MeshLambertMaterial({ color: 0x333333 });
        this.tower = new THREE.Mesh(towerGeo, towerMat);
        this.tower.position.set(0, towerHeight / 2, 0);
        this.tower.castShadow = true;
        this.tower.receiveShadow = true;

        // Lámpara Roja
        const redGeo = new THREE.CylinderGeometry(lightRadius, lightRadius, 0.4, 16);
        this.redLight = new THREE.Mesh(redGeo, this.lightMaterial);
        this.redLight.position.set(0, towerHeight * 0.8, 0);
        this.redLight.castShadow = true;

        // Lámpara Amarilla
        const yellowGeo = new THREE.CylinderGeometry(lightRadius, lightRadius, 0.4, 16);
        this.yellowLight = new THREE.Mesh(yellowGeo, this.lightMaterial);
        this.yellowLight.position.set(0, towerHeight * 0.3, 0);
        this.yellowLight.castShadow = true;

        // Lámpara Verde
        const greenGeo = new THREE.CylinderGeometry(lightRadius, lightRadius, 0.4, 16);
        this.greenLight = new THREE.Mesh(greenGeo, this.lightMaterial);
        this.greenLight.position.set(0, -towerHeight * 0.2, 0);
        this.greenLight.castShadow = true;

        // Ensamblar el semáforo
        this.mesh = new THREE.Group();
        this.mesh.add(this.tower);
        this.mesh.add(this.redLight);
        this.mesh.add(this.yellowLight);
        this.mesh.add(this.greenLight);
        // Posición ya se establece en el constructor
    }

    /**
     * Actualiza el estado del semáforo y la luz correspondiente.
     * @param {number} dt Tiempo transcurrido en segundos desde el último paso.
     */
    update(dt) {
        if (!this.enabled) return;

        this.timer += dt;
        this._updateStateByTimer();
        this._updateLightIntensity();
    }

    /**
     * Lógica de cambio de estado basada en el timer.
     * @private
     */
    _updateStateByTimer() {
        const { GREEN_DURATION, YELLOW_DURATION, RED_DURATION, RED_YELLOW_DURATION } = this.config;

        // Acumulamos timer y cambiamos de estado cuando pasa el tiempo
        if (this.state === 'GREEN' && this.timer >= GREEN_DURATION) {
            this.state = 'YELLOW';
            this.timer = 0;
        } else if (this.state === 'YELLOW' && this.timer >= YELLOW_DURATION) {
            this.state = 'RED';
            this.timer = 0;
        } else if (this.state === 'RED' && this.timer >= RED_DURATION) {
            this.state = 'RED_YELLOW';
            this.timer = 0;
        } else if (this.state === 'RED_YELLOW' && this.timer >= RED_YELLOW_DURATION) {
            // Reiniciar a GREEN
            this.state = 'GREEN';
            this.timer = 0;
        }
    }

    /**
     * Ajusta la intensidad/color de las lámparas según el estado actual.
     * @private
     */
    _updateLightIntensity() {
        // Resetear brillo de todas
        const baseIntensity = 1.0;

        this.redLight.visible = false;
        this.yellowLight.visible = false;
        this.greenLight.visible = false;

        switch (this.state) {
            case 'GREEN':
                this.greenLight.visible = true;
                this.greenLight.material.opacity = baseIntensity;
                break;
            case 'YELLOW':
                this.yellowLight.visible = true;
                this.yellowLight.material.opacity = baseIntensity;
                break;
            case 'RED':
                this.redLight.visible = true;
                this.redLight.material.opacity = baseIntensity;
                break;
            case 'RED_YELLOW':
                this.redLight.visible = true;
                this.yellowLight.visible = true;
                this.redLight.material.opacity = baseIntensity * 0.8;
                this.yellowLight.material.opacity = baseIntensity * 0.8;
                break;
        }
    }

    /**
     * Habilita/deshabilita este semáforo.
     * @param {boolean} enabled
     */
    setEnabled(enabled) {
        this.enabled = enabled;
    }

    /**
     * Obtiene el estado actual de la luz.
     * @returns {string} 'GREEN' | 'YELLOW' | 'RED' | 'RED_YELLOW'
     */
    getState() {
        return this.state;
    }

    /**
     * Obtiene el tiempo restante en el estado actual (0..1).
     * @returns {number}
     */
    getProgress() {
        const { GREEN_DURATION, YELLOW_DURATION, RED_DURATION, RED_YELLOW_DURATION } = this.config;
        let totalCycle;

        if (this.state === 'GREEN') totalCycle = GREEN_DURATION;
        else if (this.state === 'YELLOW') totalCycle = YELLOW_DURATION;
        else if (this.state === 'RED') totalCycle = RED_DURATION;
        else if (this.state === 'RED_YELLOW') totalCycle = RED_YELLOW_DURATION;

        return this.timer / totalCycle;
    }
}