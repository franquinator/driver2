/**
 * Módulo para gestionar las entradas de teclado del juego.
 * - Estado continuo (teclas mantenidas): forward, backward, left, right, handbrake.
 * - Acciones de una sola vez (pulsaciones): reset, selectVehicle.
 */
export class InputHandler {
    /**
     * @param {Object} controls Mapa de teclas (`CONFIG.CONTROLS`).
     */
    constructor(controls) {
        this.controls = controls;

        this.keys = {
            forward: false,
            backward: false,
            left: false,
            right: false,
            handbrake: false
        };

        // Acciones pendientes de consumir
        this._actions = [];

        // Referencias a los listeners para poder removerlos limpiamente
        this._onKeyDown = this._handleKeyDown.bind(this);
        this._onKeyUp = this._handleKeyUp.bind(this);
        this._onBlur = this._handleBlur.bind(this);

        window.addEventListener('keydown', this._onKeyDown);
        window.addEventListener('keyup', this._onKeyUp);
        window.addEventListener('blur', this._onBlur);
    }

    /** @private */
    _handleKeyDown(event) {
        const c = this.controls;
        if (this._updateKeyState(event.code, true)) event.preventDefault();

        if (event.repeat) return;

        if (c.RESET.includes(event.code)) {
            this._actions.push({ type: 'reset' });
        }
        const vehicleIndex = c.SELECT_VEHICLE.indexOf(event.code);
        if (vehicleIndex !== -1) {
            this._actions.push({ type: 'selectVehicle', index: vehicleIndex });
        }
    }

    /** @private */
    _handleKeyUp(event) {
        this._updateKeyState(event.code, false);
    }

    /**
     * Suelta todas las teclas si la ventana pierde el foco.
     * @private
     */
    _handleBlur() {
        Object.keys(this.keys).forEach(k => { this.keys[k] = false; });
    }

    /**
     * Mapea el código de la tecla al estado interno.
     * @returns {boolean} True si la tecla es de conducción.
     * @private
     */
    _updateKeyState(code, isPressed) {
        const c = this.controls;
        const map = {
            forward: c.FORWARD,
            backward: c.BACKWARD,
            left: c.LEFT,
            right: c.RIGHT,
            handbrake: c.HANDBRAKE
        };
        let handled = false;
        for (const [key, codes] of Object.entries(map)) {
            if (codes.includes(code)) {
                this.keys[key] = isPressed;
                handled = true;
            }
        }
        return handled;
    }

    /**
     * Devuelve una copia con el estado actual de las teclas mantenidas.
     * @returns {Object} { forward, backward, left, right, handbrake }
     */
    getState() {
        return { ...this.keys };
    }

    /**
     * Devuelve y vacía las acciones pulsadas desde la última llamada.
     * @returns {Array<{type: string, index?: number}>}
     */
    consumeActions() {
        const actions = this._actions;
        this._actions = [];
        return actions;
    }

    /**
     * Limpia los listeners globales al destruir la instancia.
     */
    destroy() {
        window.removeEventListener('keydown', this._onKeyDown);
        window.removeEventListener('keyup', this._onKeyUp);
        window.removeEventListener('blur', this._onBlur);
    }
}
