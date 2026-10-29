/**
 * Panel de configuración desplegable (estilo retro) para Driver 2.
 *
 * - Botón flotante (esquina superior derecha) para abrir/cerrar.
 * - Panel fijo a la derecha que se desliza desde la derecha (con scroll interno).
 * - Lista de categorías; varias pueden estar abiertas a la vez.
 * - Cada categoría puede tener subcategorías (p. ej. Vehículos -> por coche).
 * - Los campos se generan a partir de las rutas dentro de `CONFIG`
 *   (números y booleanos); el label se infiere desde la ruta.
 */
import { CONFIG } from '../config.js';

const SECTOR_LABELS = {
    AUDIO: 'Audio',
    PHYSICS: 'Fisica',
    DAMAGE: 'Dano',
    CAMERA: 'Camara',
    VEHICLES: 'Vehiculos',
    ENGINE: 'Motor',
    CRASH: 'Choque',
    MASTER_VOLUME: 'Volume master',
    ENABLED: 'Sounds on',
    IDLE_RPM: 'Rpm idle',
    IDLE_GAIN: 'Gain idle',
    IDLE_HZ: 'Hz idle',
    MAX_HZ: 'Hz max',
    LOWPASS_IDLE: 'Lp idle',
    LOWPASS_MAX: 'Lp max',
    VOLUME: 'Volume',
    MAX_VELOCITY: 'Crash max vel',
    NOISE_LOWPASS: 'Crash noise lp',
    THUD_HZ: 'Crash thud hz',
    GRAVITY: 'Gravity',
    TIMESTEP: 'Timestep',
    MAX_SUBSTEPS: 'Substeps max',
    MIN_IMPACT: 'Impact min',
    SCALE: 'Scale dano',
    MAX_ENGINE_LOSS: 'Loss engine',
    MAX_SPEED_LOSS: 'Loss speed',
    MAX_STEER_PULL: 'Steer pull',
    MAX_DARKEN: 'Darken',
    FOV: 'FOV',
    OFFSET: 'Cam offset',
    LERP_FACTOR: 'Lerp',
    MASS: 'Mass',
    ENGINE_FORCE: 'Engine force',
    DURABILITY: 'Durability',
    CAMERA_SCALE: 'Cam scale',
};

/**
 * Genera la lista de contenedores del panel a partir de las secciones
 * y subsecciones de `CONFIG` (números y booleans como campos editables).
 */
function buildContainers() {
    const containers = [];

    const addFlat = (prefix, label) => {
        const fields = [];
        const walk = (obj, path) => {
            for (const key of Object.keys(obj)) {
                const k = path ? `${path}.${key}` : key;
                const v = obj[key];
                if (v && typeof v === 'object' && !Array.isArray(v)) {
                    walk(v, k);
                } else if (typeof v === 'boolean') {
                    fields.push({ key: k, type: 'boolean' });
                } else if (typeof v === 'number') {
                    fields.push({ key: k, type: 'number' });
                }
            }
        };
        walk(CONFIG[prefix], prefix);
        containers.push({ id: prefix.toLowerCase(), label, fields });
    };

    addFlat('AUDIO', 'Audio');
    addFlat('PHYSICS', 'Fisica');
    addFlat('DAMAGE', 'Dano');
    addFlat('CAMERA', 'Camara');

    const vehicles = { id: 'vehicles', label: 'Vehiculos', subs: [] };
    for (const key of Object.keys(CONFIG.VEHICLES)) {
        const preset = CONFIG.VEHICLES[key];
        const fields = [];
        for (const fk of Object.keys(preset)) {
            const v = preset[fk];
            if (typeof v === 'boolean') fields.push({ key: `VEHICLES.${key}.${fk}`, type: 'boolean' });
            else if (typeof v === 'number') fields.push({ key: `VEHICLES.${key}.${fk}`, type: 'number' });
        }
        vehicles.subs.push({ id: `VEHICLES.${key}`, label: preset.NAME ?? key, fields });
    }
    containers.push(vehicles);

    return containers;
}

/**
 * Panel de configuración desplegable (estilo retro) para Driver 2.
 */
export class SettingsPanel {
    constructor({ onChange, getValue, onReset }) {
        this.onChange = onChange;
        this.getValue = getValue;
        this.onReset = onReset;
        this.isOpen = false;
        this.openPaths = new Set();
        this.containers = buildContainers();

        this.toggleEl = document.createElement('button');
        this.toggleEl.id = 'settings-toggle';
        this.toggleEl.textContent = 'CONFIG';
        this.toggleEl.addEventListener('click', () => this._setOpen(!this.isOpen));

        this.panelEl = document.createElement('div');
        this.panelEl.id = 'settings-panel';

        const header = document.createElement('div');
        header.className = 'settings-header';
        const title = document.createElement('span');
        title.className = 'settings-title';
        title.textContent = 'CONFIG';
        const closeBtn = document.createElement('button');
        closeBtn.id = 'settings-close';
        closeBtn.className = 'settings-close';
        closeBtn.textContent = 'x';
        closeBtn.addEventListener('click', () => this._setOpen(false));
        const resetBtn = document.createElement('button');
        resetBtn.id = 'settings-reset';
        resetBtn.className = 'settings-reset';
        resetBtn.textContent = 'RESET';
        resetBtn.addEventListener('click', () => this.onReset());
        header.appendChild(title);
        header.appendChild(resetBtn);
        header.appendChild(closeBtn);

        this.bodyEl = document.createElement('div');
        this.bodyEl.className = 'settings-body';
        this.panelEl.appendChild(header);
        this.panelEl.appendChild(this.bodyEl);

        document.body.appendChild(this.toggleEl);
        document.body.appendChild(this.panelEl);
    }

    open() { this._setOpen(true); }
    close() { this._setOpen(false); }
    toggle() { this._setOpen(!this.isOpen); }

    _setOpen(open) {
        this.isOpen = open;
        if (open) {
            this.panelEl.classList.add('open');
            this._render();
        } else {
            this.panelEl.classList.remove('open');
        }
    }

    _toggle(id) {
        if (this.openPaths.has(id)) this.openPaths.delete(id);
        else this.openPaths.add(id);
        this._render();
    }

    _render() {
        this.bodyEl.innerHTML = '';

        for (const c of this.containers) {
            const isOpen = this.openPaths.has(c.id);
            const row = document.createElement('div');
            row.className = 'settings-category';

            const headerBtn = document.createElement('button');
            headerBtn.className = 'settings-category-header';
            if (isOpen) headerBtn.classList.add('open');
            const chevron = document.createElement('span');
            chevron.className = 'settings-chevron' + (isOpen ? ' open' : '');
            chevron.textContent = isOpen ? 'v' : '>';
            headerBtn.appendChild(chevron);
            headerBtn.appendChild(document.createTextNode(c.label));
            headerBtn.addEventListener('click', () => this._toggle(c.id));
            row.appendChild(headerBtn);

            if (isOpen) {
                if (c.subs) {
                    for (const sub of c.subs) {
                        const subOpen = this.openPaths.has(sub.id);
                        const subRow = document.createElement('div');
                        subRow.className = 'settings-subcategory';

                        const subBtn = document.createElement('button');
                        subBtn.className = 'settings-subcategory-header';
                        if (subOpen) subBtn.classList.add('open');
                        const subChevron = document.createElement('span');
                        subChevron.className = 'settings-chevron' + (subOpen ? ' open' : '');
                        subChevron.textContent = subOpen ? 'v' : '>';
                        subBtn.appendChild(subChevron);
                        subBtn.appendChild(document.createTextNode(sub.label));
                        subBtn.addEventListener('click', () => this._toggle(sub.id));
                        subRow.appendChild(subBtn);

                        if (subOpen) {
                            const fieldsDiv = document.createElement('div');
                            fieldsDiv.className = 'settings-fields';
                            for (const f of sub.fields) fieldsDiv.appendChild(this._renderField(f));
                            subRow.appendChild(fieldsDiv);
                        }
                        row.appendChild(subRow);
                    }
                } else {
                    const fieldsDiv = document.createElement('div');
                    fieldsDiv.className = 'settings-fields';
                    for (const f of c.fields) fieldsDiv.appendChild(this._renderField(f));
                    row.appendChild(fieldsDiv);
                }
            }
            this.bodyEl.appendChild(row);
        }
    }

    _renderField(f) {
        const row = document.createElement('div');
        row.className = 'settings-field';

        const label = document.createElement('label');
        label.className = 'settings-label';
        label.textContent = this._labelFromPath(f.key);
        row.appendChild(label);

        if (f.type === 'boolean') {
            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.className = 'settings-checkbox';
            cb.checked = !!this.getValue(f.key);
            cb.addEventListener('change', () => this.onChange(f.key, cb.checked));
            row.appendChild(cb);
            return row;
        }

        const valueEl = document.createElement('span');
        valueEl.className = 'settings-value';
        valueEl.textContent = String(this.getValue(f.key) ?? 0);
        row.appendChild(valueEl);

        const num = document.createElement('input');
        num.type = 'number';
        num.className = 'settings-number';
        num.value = String(this.getValue(f.key) ?? 0);
        num.addEventListener('change', () => {
            const v = parseFloat(num.value);
            if (!Number.isNaN(v)) this.onChange(f.key, v);
        });
        row.appendChild(num);
        return row;
    }

    _labelFromPath(path) {
        const parts = path.split('.').filter(Boolean);
        const labels = parts.map(p => (SECTOR_LABELS[p] !== undefined ? SECTOR_LABELS[p] : this._prettify(p)));
        return labels.join(' - ');
    }

    _prettify(p) {
        return p.replace(/_/g, ' ').replace(/\b\w/g, ch => ch.toUpperCase());
    }
}
