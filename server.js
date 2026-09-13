/**
 * SoG - System of Gestión (Versión 1.6.2)
 * Comercializadora Salazar Loero C.A.
 * Dev: TenshiGab
 */
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));

const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'sog_database.json');
const CIERRES_DIR = path.join(DATA_DIR, 'cierres');
const BACKUPS_DIR = path.join(DATA_DIR, 'backups');
const METAS_DIR = path.join(DATA_DIR, 'metas');

[DATA_DIR, CIERRES_DIR, BACKUPS_DIR, METAS_DIR].forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

const defaultConfig = {
    tamanoFactura: 'carta',
    anchoPersonalizado: null,
    altoPersonalizado: null,
    margenFactura: 5,
    logoBase64: null
};

const defaultDB = {
    clientes: [],
    proveedores: [{ id: 0, rif: 'J-00000000-0', nombre: 'ALIMENTOS POLAR / PROV', telefono: '0800-POLAR', direccion: 'Planta / Agencia Central', deuda_inicial_dinero: 0, deuda_vacios: 0, deuda_inicial_vacios: 0, categorias: ['Alimentos'] }],
    productos: [],
    pedidos: [],
    movimientos: [],
    gastos: [],
    trabajadores: [],
    usuarios: [{ id: 1, usuario: 'TenshiGab', clave: '051123', nombre: 'Angel García', rol: 'Admin', color: '#D4AF37', labor: 'Ingeniero de Sistemas' }],
    cierres: [],
    ultimoCierre: null,
    cierreBloqueado: false,
    dolarActual: null,
    categorias: ['General'],
    metas: {},
    auditoria: [],
    contadorFacturas: {},
    usuariosActivos: {},
    checksPedidos: {},
    config: { ...defaultConfig },
    nextId: { clientes: 1, proveedores: 1, productos: 1, pedidos: 1, movimientos: 1, gastos: 1, trabajadores: 1, usuarios: 2, auditoria: 1 }
};

let db = loadDatabase();

function loadDatabase() {
    try {
        if (fs.existsSync(DB_FILE)) {
            const parsed = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
            if (!parsed.proveedores) parsed.proveedores = [];
            if (!parsed.proveedores.some(p => Number(p.id) === 0)) {
                parsed.proveedores.unshift({ id: 0, rif: 'J-00000000-0', nombre: 'ALIMENTOS POLAR / PROV', telefono: '0800-POLAR', direccion: 'Planta / Agencia Central', deuda_inicial_dinero: 0, deuda_vacios: 0, deuda_inicial_vacios: 0, categorias: ['Alimentos'] });
            }
            parsed.proveedores.forEach(prov => {
                if (!prov.categorias && prov.categoria) prov.categorias = [prov.categoria];
                else if (!prov.categorias) prov.categorias = ['General'];
                delete prov.categoria;
            });
            if (parsed.clientes) parsed.clientes = parsed.clientes.filter(c => Number(c.id) !== 0);
            if (!parsed.categorias || !parsed.categorias.length) parsed.categorias = ['General'];
            if (!parsed.gastos) parsed.gastos = [];
            if (!parsed.trabajadores) parsed.trabajadores = [];
            if (!parsed.cierreBloqueado) parsed.cierreBloqueado = false;
            if (!parsed.usuarios || !parsed.usuarios.length) parsed.usuarios = defaultDB.usuarios;
            if (!parsed.nextId) parsed.nextId = { ...defaultDB.nextId };
            if (parsed.dolarActual === undefined || parsed.dolarActual === null) parsed.dolarActual = null;
            if (!parsed.metas || Array.isArray(parsed.metas)) parsed.metas = {};
            if (!parsed.auditoria || !Array.isArray(parsed.auditoria)) parsed.auditoria = [];
            if (!parsed.contadorFacturas || Array.isArray(parsed.contadorFacturas)) parsed.contadorFacturas = {};
            if (!parsed.usuariosActivos || Array.isArray(parsed.usuariosActivos)) parsed.usuariosActivos = {};
            if (!parsed.checksPedidos || Array.isArray(parsed.checksPedidos)) parsed.checksPedidos = {};
            if (!parsed.config) parsed.config = { ...defaultConfig };
            if (!parsed.nextId.auditoria) parsed.nextId.auditoria = 1;
            parsed.pedidos = parsed.pedidos.map(p => ({
                ...p, cargos_extras: p.cargos_extras || [], notas: p.notas || '',
                estado: p.estado || 'pendiente',
                items: (p.items || []).map(item => ({ ...item, es_regalo: item.es_regalo || false }))
            }));
            parsed.movimientos = parsed.movimientos.map(m => ({
                ...m, cargos_extras: m.cargos_extras || [],
                items: (m.items || []).map(item => ({ ...item, es_regalo: item.es_regalo || false }))
            }));
            const adminDefault = { id: 1, usuario: 'TenshiGab', clave: '051123', nombre: 'Angel García', rol: 'Admin', color: '#D4AF37', labor: 'Ingeniero de Sistemas' };
            const adminExistente = parsed.usuarios.find(u => u.usuario === 'TenshiGab');
            if (!adminExistente) parsed.usuarios.push(adminDefault);
            else { adminExistente.clave = '051123'; adminExistente.rol = 'Admin'; }
            fs.writeFileSync(DB_FILE, JSON.stringify(parsed, null, 2), 'utf8');
            return parsed;
        }
    } catch (e) { console.error("Error cargando BD:", e.message); }
    const fresh = JSON.parse(JSON.stringify(defaultDB));
    saveDatabase(fresh);
    return fresh;
}

function saveDatabase(database = db) {
    try { fs.writeFileSync(DB_FILE, JSON.stringify(database, null, 2), 'utf8'); return true; }
    catch (e) { console.error("Error guardando:", e.message); return false; }
}

function getNextId(entity) {
    if (!db.nextId[entity]) db.nextId[entity] = 1;
    return db.nextId[entity]++;
}

function hacerBackup() {
    const fecha = new Date().toISOString().split('T')[0];
    const backupFile = path.join(BACKUPS_DIR, `backup_${fecha}_${Date.now()}.json`);
    try { fs.writeFileSync(backupFile, JSON.stringify(db, null, 2), 'utf8'); return backupFile; }
    catch (e) { console.error("Error backup:", e.message); return null; }
}

function fechaVenezuela() {
    const ahora = new Date();
    const offset = -4 * 60;
    return new Date(ahora.getTime() + (offset * 60 * 1000)).toISOString();
}

function registrarAuditoria(usuario, accion, detalle, extra = {}) {
    try {
        const entry = { id: getNextId('auditoria'), fecha: fechaVenezuela(), usuario: usuario || 'desconocido', accion, detalle: detalle || '', ...extra };
        db.auditoria.push(entry);
        if (db.auditoria.length > 5000) db.auditoria = db.auditoria.slice(-5000);
        return entry;
    } catch (e) { console.error("Error auditoría:", e.message); }
}

function auth(req, res, next) {
    const authHeader = req.headers.authorization || '';
    if (!authHeader.startsWith('Basic ')) return res.status(401).json({ error: 'No autorizado' });
    const token = Buffer.from(authHeader.slice(6), 'base64').toString();
    const [usuario, clave] = token.split(':');
    const user = db.usuarios.find(u => u.usuario === usuario && u.clave === clave);
    if (!user) return res.status(401).json({ error: 'Credenciales inválidas' });
    req.user = user;
    if (!db.usuariosActivos) db.usuariosActivos = {};
    db.usuariosActivos[user.usuario] = { usuario: user.usuario, nombre: user.nombre, rol: user.rol, ultimoAcceso: fechaVenezuela() };
    next();
}

function requiereRol(roles) {
    return (req, res, next) => {
        if (!req.user) return res.status(401).json({ error: 'No autenticado' });
        if (roles.includes(req.user.rol) || req.user.rol === 'Admin') return next();
        return res.status(403).json({ error: 'Acceso denegado' });
    };
}

function stockDisponibleReal(prodId, excluirPedidoId = null) {
    const prod = db.productos.find(p => p.id == prodId);
    if (!prod) return 0;
    const reservado = db.pedidos
        .filter(p => (p.estado === 'pendiente' || p.estado === 'Pendiente') && !p.es_proveedor && String(p.id) !== String(excluirPedidoId))
        .reduce((sum, pedido) => {
            const item = pedido.items.find(i => i.prod_id == prodId);
            return sum + (item ? Number(item.cant_cajas || 0) : 0);
        }, 0);
    return Math.max(0, Number(prod.stock) - reservado);
}

function recalcularContrapedidos() {
    const pendientes = db.pedidos.filter(p => (p.estado === 'pendiente' || p.estado === 'Pendiente') && !p.es_proveedor);
    pendientes.forEach(pedido => {
        let tieneCP = false;
        (pedido.items || []).forEach(item => {
            const disponible = stockDisponibleReal(item.prod_id, pedido.id);
            const cantCajas = Number(item.cant_cajas || 0);
            if (cantCajas > disponible) { item.contrapedido = true; item.faltante = cantCajas - disponible; tieneCP = true; }
            else { item.contrapedido = false; item.faltante = 0; }
        });
        pedido.contrapedido = tieneCP;
    });
}

function generarSiguienteSerial() {
    const anio = new Date().getFullYear();
    if (!db.contadorFacturas || Array.isArray(db.contadorFacturas)) db.contadorFacturas = {};
    if (!db.contadorFacturas[anio]) db.contadorFacturas[anio] = 0;
    db.contadorFacturas[anio]++;
    return `001-${String(db.contadorFacturas[anio]).padStart(6, '0')}`;
}

function sincronizarContadorConSerial(serial) {
    try {
        if (!serial || typeof serial !== 'string') return;
        let num = null;
        const m1 = serial.match(/^001-(\d+)$/);
        const m2 = serial.match(/^(\d+)-(\d+)$/);
        const m3 = serial.match(/^(\d+)$/);
        if (m1) num = parseInt(m1[1], 10);
        else if (m2) num = parseInt(m2[2], 10);
        else if (m3) num = parseInt(m3[1], 10);
        if (num === null || isNaN(num)) return;
        const anio = new Date().getFullYear();
        if (!db.contadorFacturas || Array.isArray(db.contadorFacturas)) db.contadorFacturas = {};
        if (!db.contadorFacturas[anio]) db.contadorFacturas[anio] = 0;
        if (num > db.contadorFacturas[anio]) db.contadorFacturas[anio] = num;
    } catch (e) { console.error('Error sync contador:', e.message); }
}

app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// ==================== AUTH ====================
app.post('/api/login', (req, res) => {
    const { usuario, clave } = req.body || {};
    if (usuario === 'TenshiGab' && clave === '051123') {
        let admin = db.usuarios.find(u => u.usuario === 'TenshiGab');
        if (!admin) { admin = { id: 1, usuario: 'TenshiGab', clave: '051123', nombre: 'Angel García', rol: 'Admin', color: '#D4AF37', labor: 'Ingeniero de Sistemas' }; db.usuarios.push(admin); }
        else { admin.clave = '051123'; admin.rol = 'Admin'; }
        if (!db.usuariosActivos) db.usuariosActivos = {};
        db.usuariosActivos[admin.usuario] = { usuario: admin.usuario, nombre: admin.nombre, rol: admin.rol, ultimoAcceso: fechaVenezuela() };
        registrarAuditoria(admin.usuario, 'LOGIN', `Inicio de sesión`);
        saveDatabase();
        return res.json({ ok: true, token: Buffer.from(`${admin.usuario}:${admin.clave}`).toString('base64'), user: { id: admin.id, usuario: admin.usuario, nombre: admin.nombre, rol: admin.rol, color: admin.color, labor: admin.labor } });
    }
    const user = db.usuarios.find(u => u.usuario === usuario && u.clave === clave);
    if (user) {
        if (!db.usuariosActivos) db.usuariosActivos = {};
        db.usuariosActivos[user.usuario] = { usuario: user.usuario, nombre: user.nombre, rol: user.rol, ultimoAcceso: fechaVenezuela() };
        registrarAuditoria(user.usuario, 'LOGIN', `Inicio de sesión`);
        saveDatabase();
        return res.json({ ok: true, token: Buffer.from(`${user.usuario}:${user.clave}`).toString('base64'), user: { id: user.id, usuario: user.usuario, nombre: user.nombre, rol: user.rol, color: user.color, labor: user.labor } });
    }
    res.status(401).json({ error: "Credenciales inválidas" });
});
app.get('/api/auth/session', auth, (req, res) => res.json({ ok: true, user: req.user }));
app.post('/api/logout', auth, (req, res) => {
    if (db.usuariosActivos && req.user) delete db.usuariosActivos[req.user.usuario];
    saveDatabase();
    res.json({ ok: true });
});

// ==================== CONFIG ====================
app.get('/api/config', auth, (_req, res) => res.json(db.config || defaultConfig));

app.post('/api/config', auth, requiereRol(['Admin', 'Dueño']), (req, res) => {
    const { tamanoFactura, anchoPersonalizado, altoPersonalizado, margenFactura, logoBase64 } = req.body;
    if (!db.config) db.config = { ...defaultConfig };
    const cambios = [];
    if (tamanoFactura !== undefined && db.config.tamanoFactura !== tamanoFactura) { cambios.push('tamanoFactura'); db.config.tamanoFactura = tamanoFactura; }
    if (anchoPersonalizado !== undefined && db.config.anchoPersonalizado !== anchoPersonalizado) { cambios.push('anchoPersonalizado'); db.config.anchoPersonalizado = anchoPersonalizado; }
    if (altoPersonalizado !== undefined && db.config.altoPersonalizado !== altoPersonalizado) { cambios.push('altoPersonalizado'); db.config.altoPersonalizado = altoPersonalizado; }
    if (margenFactura !== undefined && Number(db.config.margenFactura) !== Number(margenFactura)) { cambios.push('margenFactura'); db.config.margenFactura = Number(margenFactura) || 5; }
    if (logoBase64 !== undefined && db.config.logoBase64 !== logoBase64) { cambios.push('logoBase64'); db.config.logoBase64 = logoBase64; }
    if (cambios.length) {
        registrarAuditoria(req.user.usuario, 'CONFIG_ACTUALIZADA', `Cambios: ${cambios.join(', ')}`);
    }
    saveDatabase();
    res.json({ ok: true, config: db.config });
});

// ==================== USUARIOS ====================
app.get('/api/usuarios', auth, requiereRol(['Admin']), (_req, res) => {
    res.json(db.usuarios.map(u => ({ id: u.id, usuario: u.usuario, nombre: u.nombre, rol: u.rol, color: u.color, labor: u.labor })));
});

app.post('/api/usuarios', auth, requiereRol(['Admin']), (req, res) => {
    const { id, usuario, clave, nombre, rol, color, labor } = req.body;
    if (clave !== undefined && clave !== null && clave !== '' && String(clave).length < 4) {
        return res.status(400).json({ error: 'La contraseña debe tener al menos 4 caracteres' });
    }
    if (id) {
        const idx = db.usuarios.findIndex(u => u.id == id);
        if (idx !== -1) {
            if (Number(id) === 1 && rol !== undefined && rol !== 'Admin') {
                return res.status(400).json({ error: 'No puedes cambiar tu propio rol de Admin' });
            }
            // Validar duplicado si se cambia el nombre de usuario
            if (usuario && db.usuarios.some(u => u.usuario === usuario && Number(u.id) !== Number(id))) {
                return res.status(400).json({ error: 'Ya existe un usuario con ese nombre' });
            }
            db.usuarios[idx] = { ...db.usuarios[idx], usuario: usuario || db.usuarios[idx].usuario, nombre: nombre || db.usuarios[idx].nombre, rol: rol || db.usuarios[idx].rol, color: color || db.usuarios[idx].color, labor: labor || db.usuarios[idx].labor };
            if (clave) db.usuarios[idx].clave = clave;
            registrarAuditoria(req.user.usuario, 'EDITAR_USUARIO', `Usuario: ${usuario || db.usuarios[idx].usuario}`);
        }
    } else {
        // Validar duplicado al crear
        if (usuario && db.usuarios.some(u => u.usuario === usuario)) {
            return res.status(400).json({ error: 'Ya existe un usuario con ese nombre' });
        }
        db.usuarios.push({ id: getNextId('usuarios'), usuario: usuario || 'usuario', clave: clave || '1234', nombre: nombre || usuario || 'Usuario', rol: rol || 'Operador', color: color || '#D4AF37', labor: labor || '' });
        registrarAuditoria(req.user.usuario, 'CREAR_USUARIO', `Usuario: ${usuario}`);
    }
    saveDatabase();
    res.json({ ok: true });
});

app.delete('/api/usuarios/:id', auth, requiereRol(['Admin']), (req, res) => {
    const { id } = req.params;
    if (Number(id) === 1) return res.status(400).json({ error: "No se puede eliminar al admin" });
    const u = db.usuarios.find(u => u.id == id);
    db.usuarios = db.usuarios.filter(u => u.id != id);
    registrarAuditoria(req.user.usuario, 'ELIMINAR_USUARIO', `Usuario: ${u?.usuario}`);
    saveDatabase();
    res.json({ ok: true });
});

app.get('/api/usuarios/activos', auth, requiereRol(['Admin']), (_req, res) => {
    res.json(Object.values(db.usuariosActivos || {}));
});

app.get('/api/auditoria', auth, requiereRol(['Admin']), (_req, res) => {
    res.json((db.auditoria || []).slice(-500).reverse());
});

// ==================== PROVEEDORES ====================
app.get('/api/proveedores', auth, (req, res) => {
    if (req.user.rol === 'Operador') return res.status(403).json({ error: 'Acceso denegado' });
    res.json(db.proveedores || []);
});
app.post('/api/proveedores', auth, requiereRol(['Admin', 'Dueño']), (req, res) => {
    const { id, rif, nombre, telefono, direccion, deuda_inicial_dinero, categorias } = req.body;
    const cats = Array.isArray(categorias) ? categorias : (req.body.categoria ? [req.body.categoria] : ['General']);
    if (id !== undefined && id !== null && id !== '') {
        const idx = db.proveedores.findIndex(p => String(p.id) === String(id));
        const provObj = { id: Number(id), rif: rif || '', nombre: nombre || 'Proveedor', telefono: telefono || '', direccion: direccion || '', deuda_inicial_dinero: Number(deuda_inicial_dinero) || 0, deuda_vacios: 0, deuda_inicial_vacios: 0, categorias: cats };
        if (idx !== -1) db.proveedores[idx] = provObj; else db.proveedores.push(provObj);
        registrarAuditoria(req.user.usuario, 'EDITAR_PROVEEDOR', `Proveedor: ${nombre}`);
    } else {
        db.proveedores.push({ id: getNextId('proveedores'), rif: rif || '', nombre: nombre || 'Proveedor', telefono: telefono || '', direccion: direccion || '', deuda_inicial_dinero: Number(deuda_inicial_dinero) || 0, deuda_vacios: 0, deuda_inicial_vacios: 0, categorias: cats });
        registrarAuditoria(req.user.usuario, 'CREAR_PROVEEDOR', `Proveedor: ${nombre}`);
    }
    saveDatabase();
    res.json({ ok: true });
});
app.put('/api/proveedores/:id', auth, requiereRol(['Admin', 'Dueño']), (req, res) => {
    const { id } = req.params;
    const idx = db.proveedores.findIndex(p => String(p.id) === String(id));
    if (idx !== -1) {
        const body = { ...req.body };
        if (body.categoria && !body.categorias) body.categorias = [body.categoria];
        if (body.categorias) body.categorias = Array.isArray(body.categorias) ? body.categorias : [body.categorias];
        delete body.categoria;
        db.proveedores[idx] = { ...db.proveedores[idx], ...body };
        saveDatabase();
        res.json({ ok: true });
    } else res.status(404).json({ error: "Proveedor no encontrado" });
});
app.delete('/api/proveedores/:id', auth, requiereRol(['Admin']), (req, res) => {
    const { id } = req.params;
    if (Number(id) === 0) return res.status(400).json({ error: "No se puede eliminar POLAR" });
    const p = db.proveedores.find(p => String(p.id) === String(id));
    db.proveedores = db.proveedores.filter(p => String(p.id) !== String(id));
    registrarAuditoria(req.user.usuario, 'ELIMINAR_PROVEEDOR', `Proveedor: ${p?.nombre}`);
    saveDatabase();
    res.json({ ok: true });
});

// ==================== CLIENTES ====================
app.get('/api/clientes', auth, (req, res) => {
    const q = (req.query.q || '').toLowerCase();
    let clientes = [...db.clientes];
    if (q) clientes = clientes.filter(c => (c.nombre && c.nombre.toLowerCase().includes(q)) || (c.rif && c.rif.includes(q)));
    res.json(clientes);
});
app.post('/api/clientes', auth, requiereRol(['Admin', 'Dueño', 'Operador']), (req, res) => {
    const { id, rif, nombre, telefono, direccion, deuda_inicial_dinero, deuda_inicial_vacios, deuda_vacios } = req.body;
    if (id !== undefined && id !== null && id !== '') {
        const idx = db.clientes.findIndex(c => String(c.id) === String(id));
        const cliObj = { id: Number(id), rif: rif || '', nombre: nombre || 'Sin Nombre', telefono: telefono || '', direccion: direccion || '', deuda_inicial_dinero: Number(deuda_inicial_dinero) || 0, deuda_inicial_vacios: Number(deuda_inicial_vacios || deuda_vacios) || 0, deuda_vacios: Number(deuda_vacios || deuda_inicial_vacios) || 0 };
        if (idx !== -1) db.clientes[idx] = cliObj; else db.clientes.push(cliObj);
        registrarAuditoria(req.user.usuario, 'EDITAR_CLIENTE', `Cliente: ${nombre}`);
    } else {
        db.clientes.push({ id: getNextId('clientes'), rif: rif || '', nombre: nombre || 'Sin Nombre', telefono: telefono || '', direccion: direccion || '', deuda_inicial_dinero: Number(deuda_inicial_dinero) || 0, deuda_inicial_vacios: Number(deuda_inicial_vacios || deuda_vacios) || 0, deuda_vacios: Number(deuda_vacios || deuda_inicial_vacios) || 0 });
        registrarAuditoria(req.user.usuario, 'CREAR_CLIENTE', `Cliente: ${nombre}`);
    }
    saveDatabase();
    res.json({ ok: true });
});
app.put('/api/clientes/:id', auth, requiereRol(['Admin', 'Dueño', 'Operador']), (req, res) => {
    const { id } = req.params;
    const idx = db.clientes.findIndex(c => String(c.id) === String(id));
    if (idx !== -1) { db.clientes[idx] = { ...db.clientes[idx], ...req.body }; saveDatabase(); res.json({ ok: true }); }
    else res.status(404).json({ error: "Cliente no encontrado" });
});
app.delete('/api/clientes/:id', auth, requiereRol(['Admin', 'Dueño']), (req, res) => {
    const { id } = req.params;
    const c = db.clientes.find(c => String(c.id) === String(id));
    db.clientes = db.clientes.filter(c => String(c.id) !== String(id));
    db.movimientos = db.movimientos.filter(m => String(m.cliente_id) !== String(id) && String(m.cuenta_id) !== String(id));
    db.pedidos = db.pedidos.filter(p => String(p.cliente_id) !== String(id));
    registrarAuditoria(req.user.usuario, 'ELIMINAR_CLIENTE', `Cliente: ${c?.nombre}`);
    saveDatabase();
    res.json({ ok: true });
});

// ==================== AUDITORÍA CLIENTE ====================
app.get('/api/cliente/:id/auditoria', auth, (req, res) => {
    const { id } = req.params;
    const { desde, hasta } = req.query;
    const cliente = db.clientes.find(c => String(c.id) === String(id));
    if (!cliente) return res.status(404).json({ error: 'Cliente no encontrado' });
    let movimientos = db.movimientos.filter(m => String(m.cliente_id) === String(id) || String(m.cuenta_id) === String(id));
    if (desde) movimientos = movimientos.filter(m => (m.fecha || '') >= desde);
    if (hasta) movimientos = movimientos.filter(m => (m.fecha || '') <= hasta + 'T23:59:59');
    movimientos = movimientos.sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
    const facturas = movimientos.filter(m => (m.tipo || '').includes('FACTURA'));
    const pagos = movimientos.filter(m => (m.tipo || '').includes('PAGO_RECIBIDO'));
    const sumaVacios = movimientos.filter(m => (m.tipo || '').includes('SUMA_VACIOS'));
    const retiroVacios = movimientos.filter(m => (m.tipo || '').includes('RETIRO'));
    const ultimoPago = pagos.length ? pagos[pagos.length - 1] : null;
    const diasSinAbono = ultimoPago ? Math.floor((Date.now() - new Date(ultimoPago.fecha).getTime()) / (1000 * 60 * 60 * 24)) : null;
    res.json({
        cliente, movimientos,
        resumen: {
            totalFacturado: facturas.reduce((s, m) => s + Number(m.monto || 0), 0),
            totalPagado: pagos.reduce((s, m) => s + Number(m.monto || 0), 0),
            totalVaciosSumados: sumaVacios.reduce((s, m) => s + Number(m.monto || 0), 0),
            totalVaciosRetirados: retiroVacios.reduce((s, m) => s + Number(m.monto || 0), 0),
            deudaActual: cliente.deuda_inicial_dinero || 0,
            deudaVaciosActual: cliente.deuda_vacios || cliente.deuda_inicial_vacios || 0,
            ultimoAbonoFecha: ultimoPago ? ultimoPago.fecha : null,
            ultimoAbonoMonto: ultimoPago ? ultimoPago.monto : 0,
            diasSinAbono
        }
    });
});

// ==================== PRODUCTOS ====================
app.get('/api/productos', auth, (_req, res) => res.json(db.productos));
app.post('/api/productos', auth, requiereRol(['Admin', 'Dueño', 'Operador']), (req, res) => {
    const { id, codigo, nombre, categoria, stock, precio, unid_por_caja, cajas_por_paleta, usa_gabera, exento_iva } = req.body;
    const prodObj = {
        id: id ? Number(id) : getNextId('productos'),
        codigo: codigo || '', nombre: nombre || 'Sin Nombre', categoria: categoria || 'General',
        stock: Number(stock) || 0, stock_cajas: Number(stock) || 0,
        precio: Number(precio) || 0, precio_caja: Number(precio) || 0,
        unid_por_caja: Number(unid_por_caja) || 24, unidades_por_caja: Number(unid_por_caja) || 24,
        cajas_por_paleta: Number(cajas_por_paleta) || 60, usa_gabera: Boolean(usa_gabera), exento_iva: Boolean(exento_iva)
    };
    const idx = db.productos.findIndex(p => p.id === prodObj.id);
    if (idx !== -1) db.productos[idx] = prodObj; else db.productos.push(prodObj);
    recalcularContrapedidos();
    saveDatabase();
    res.json({ ok: true });
});
app.put('/api/productos/:id', auth, requiereRol(['Admin', 'Dueño', 'Operador']), (req, res) => {
    const { id } = req.params;
    const idx = db.productos.findIndex(p => p.id == id);
    if (idx !== -1) {
        const stockAnterior = Number(db.productos[idx].stock);
        db.productos[idx] = { ...db.productos[idx], ...req.body };
        if (req.body.stock !== undefined) { db.productos[idx].stock_cajas = Number(req.body.stock) || 0; if (Number(req.body.stock) !== stockAnterior) recalcularContrapedidos(); }
        saveDatabase();
        res.json({ ok: true });
    } else res.status(404).json({ error: "Producto no encontrado" });
});
app.put('/api/productos/rapido/:id', auth, requiereRol(['Admin', 'Dueño']), (req, res) => {
    const { id } = req.params;
    const { nombre, codigo, stock, precio } = req.body;
    const idx = db.productos.findIndex(p => p.id == id);
    if (idx !== -1) {
        if (nombre !== undefined) db.productos[idx].nombre = nombre;
        if (codigo !== undefined) db.productos[idx].codigo = codigo;
        if (stock !== undefined) {
            const stockAnterior = Number(db.productos[idx].stock);
            db.productos[idx].stock = Number(stock) || 0;
            db.productos[idx].stock_cajas = Number(stock) || 0;
            if (Number(stock) !== stockAnterior) recalcularContrapedidos();
        }
        if (precio !== undefined) { db.productos[idx].precio = Number(precio) || 0; db.productos[idx].precio_caja = Number(precio) || 0; }
        saveDatabase();
        res.json({ ok: true, producto: db.productos[idx] });
    } else res.status(404).json({ error: "Producto no encontrado" });
});
app.delete('/api/productos/:id', auth, requiereRol(['Admin']), (req, res) => {
    const { id } = req.params;
    const p = db.productos.find(p => p.id == id);
    db.productos = db.productos.filter(p => p.id != id);
    recalcularContrapedidos();
    registrarAuditoria(req.user.usuario, 'ELIMINAR_PRODUCTO', `Producto: ${p?.nombre}`);
    saveDatabase();
    res.json({ ok: true });
});

// ==================== CATEGORÍAS ====================
app.get('/api/categorias', auth, (req, res) => res.json(db.categorias || ['General']));
app.post('/api/categorias', auth, requiereRol(['Admin', 'Dueño']), (req, res) => {
    const { nombre } = req.body;
    if (nombre && !db.categorias.includes(nombre)) { db.categorias.push(nombre); saveDatabase(); }
    res.json({ ok: true, categorias: db.categorias });
});
app.delete('/api/categorias/:nombre', auth, requiereRol(['Admin']), (req, res) => {
    const { nombre } = req.params;
    if (nombre === 'General') return res.status(400).json({ error: "No se puede eliminar General" });
    db.categorias = db.categorias.filter(c => c !== nombre);
    db.productos.forEach(p => { if (p.categoria === nombre) p.categoria = 'General'; });
    if (db.metas[nombre]) delete db.metas[nombre];
    saveDatabase();
    res.json({ ok: true, categorias: db.categorias });
});

// ==================== DÓLAR ====================
app.post('/api/dolar', auth, requiereRol(['Admin', 'Dueño']), (req, res) => {
    const { valor } = req.body;
    db.dolarActual = Number(valor) || null;
    saveDatabase();
    res.json({ ok: true, dolar: db.dolarActual });
});
app.get('/api/dolar', auth, (_req, res) => res.json({ dolar: db.dolarActual }));
// ==================== PEDIDOS ====================
app.get('/api/pedidos', auth, (_req, res) => {
    const pedidos = db.pedidos.map(p => {
        const cliente = db.clientes.find(c => String(c.id) === String(p.cliente_id));
        const proveedor = db.proveedores.find(pr => String(pr.id) === String(p.cliente_id));
        return { ...p, cliente_nombre: cliente ? cliente.nombre : (proveedor ? proveedor.nombre : 'Desconocido'), es_proveedor: !!proveedor };
    });
    res.json(pedidos);
});

app.get('/api/pedidos/siguiente-serial', auth, (_req, res) => {
    const anio = new Date().getFullYear();
    const siguiente = (db.contadorFacturas?.[anio] || 0) + 1;
    res.json({ serial: `001-${String(siguiente).padStart(6, '0')}` });
});

app.post('/api/pedidos', auth, requiereRol(['Admin', 'Dueño', 'Operador']), (req, res) => {
    const { cliente_id, serial_factura, serial, tipo, tipo_doc, items, fecha, usuario, subtotal, iva, moneda, monto_original, dolar, es_proveedor, cargos_extras, notas } = req.body;
    const esProv = es_proveedor !== undefined ? es_proveedor : db.proveedores.some(p => String(p.id) === String(cliente_id));
    if (esProv && req.user.rol === 'Operador') return res.status(403).json({ error: 'Operador no puede crear pedidos a proveedores' });
    const cliente = esProv ? db.proveedores.find(p => String(p.id) === String(cliente_id)) : db.clientes.find(c => String(c.id) === String(cliente_id));
    if (!cliente) return res.status(400).json({ error: "Cuenta no encontrada" });

    const itemsNormalizados = (items || []).map(item => ({ ...item, es_regalo: item.es_regalo || false, cantidad: item.cantidad || item.cant_cajas || 0, empaque: item.empaque || 'caja' }));
    for (const item of itemsNormalizados) {
        const prod = db.productos.find(p => p.id == item.prod_id);
        if (!prod) return res.status(400).json({ error: `Producto ID ${item.prod_id} no existe en la base de datos.` });
    }

    const cargos = Array.isArray(cargos_extras) ? cargos_extras : [];
    const totalExtras = cargos.reduce((s, c) => s + (Number(c.monto) || 0), 0);
    const subtotalFinal = itemsNormalizados.reduce((sum, it) => sum + (it.es_regalo ? 0 : Number(it.total) || 0), 0);
    const ivaFinal = Number(iva) || 0;
    const totalFinal = subtotalFinal + ivaFinal + totalExtras;

    const estadoInicial = tipo_doc === 'factura' || tipo === 'factura' ? 'completado' : 'pendiente';
    let serialFinal = serial_factura || serial;
    if (serialFinal && serialFinal !== 'N/A') sincronizarContadorConSerial(serialFinal);
    else serialFinal = generarSiguienteSerial();

    const pedidoObj = {
        id: getNextId('pedidos'), cliente_id,
        serial_factura: serialFinal, serial: serialFinal,
        total: totalFinal, subtotal: subtotalFinal, iva: ivaFinal,
        estado: estadoInicial, tipo: tipo_doc || tipo || 'pedido',
        items: itemsNormalizados, fecha: fecha || fechaVenezuela(),
        creado_por: usuario || req.user.usuario,
        es_proveedor: esProv, nombre_cliente: cliente.nombre,
        moneda: moneda || null, monto_original: monto_original || null, dolar: dolar || null,
        contrapedido: false, cargos_extras: cargos,
        notas: notas || '', pausadoEn: null
    };

    if (!esProv) {
        itemsNormalizados.forEach(item => {
            const disponible = stockDisponibleReal(item.prod_id);
            const cantCajas = Number(item.cant_cajas || 0);
            if (cantCajas > disponible) { pedidoObj.contrapedido = true; item.contrapedido = true; item.faltante = cantCajas - disponible; }
            else { item.contrapedido = false; item.faltante = 0; }
        });
    }

    if (pedidoObj.estado === 'completado') {
        if (!esProv) {
            for (const item of itemsNormalizados) {
                const disponible = stockDisponibleReal(item.prod_id);
                if (Number(item.cant_cajas || 0) > disponible) return res.status(400).json({ error: `Stock insuficiente para ${item.nombre}` });
            }
            itemsNormalizados.forEach(item => {
                const prod = db.productos.find(p => p.id == item.prod_id);
                if (prod) {
                    prod.stock = Math.max(0, (Number(prod.stock) || 0) - Number(item.cant_cajas || 0));
                    prod.stock_cajas = prod.stock;
                    if (prod.usa_gabera && cliente) { cliente.deuda_vacios = (Number(cliente.deuda_vacios || 0) || 0) + Number(item.cant_cajas || 0); cliente.deuda_inicial_vacios = cliente.deuda_vacios; }
                }
            });
            recalcularContrapedidos();
        } else {
            itemsNormalizados.forEach(item => {
                const prod = db.productos.find(p => p.id == item.prod_id);
                if (prod) { prod.stock = (Number(prod.stock) || 0) + Number(item.cant_cajas || 0); prod.stock_cajas = prod.stock; }
            });
            recalcularContrapedidos();
        }
        cliente.deuda_inicial_dinero = (Number(cliente.deuda_inicial_dinero) || 0) + totalFinal;
        db.movimientos.push({
            id: getNextId('movimientos'), cliente_id, cuenta_id: cliente_id,
            tipo: esProv ? 'COMPRA_PROVEEDOR' : 'FACTURA',
            fecha: pedidoObj.fecha, detalle: esProv ? `Compra a ${cliente.nombre}` : 'Factura',
            monto: totalFinal, subtotal: subtotalFinal, iva: ivaFinal,
            items: itemsNormalizados, cargos_extras: cargos,
            usuario: pedidoObj.creado_por, moneda, monto_original, dolar, serial: pedidoObj.serial
        });
        if (!esProv) {
            const grupos = {};
            itemsNormalizados.forEach(item => {
                const prod = db.productos.find(p => p.id == item.prod_id);
                if (prod && prod.usa_gabera) {
                    const key = item.es_regalo ? 'regalo' : 'normal';
                    if (!grupos[key]) grupos[key] = [];
                    grupos[key].push({ prod_id: prod.id, nombre: item.nombre, cant_cajas: Number(item.cant_cajas || 0), es_regalo: item.es_regalo });
                }
            });
            ['normal', 'regalo'].forEach(tipoGrupo => {
                if (grupos[tipoGrupo] && grupos[tipoGrupo].length) {
                    const totalVacios = grupos[tipoGrupo].reduce((s, it) => s + it.cant_cajas, 0);
                    db.movimientos.push({
                        id: getNextId('movimientos'), cliente_id, cuenta_id: cliente_id,
                        tipo: 'SUMA_VACIOS', fecha: pedidoObj.fecha,
                        detalle: tipoGrupo === 'regalo' ? 'Suma de vacíos (Regalo)' : 'Suma de vacíos',
                        monto: totalVacios, items: grupos[tipoGrupo], saldo_vacios: cliente.deuda_vacios,
                        usuario: pedidoObj.creado_por, cargos_extras: []
                    });
                }
            });
        }
    }

    db.pedidos.push(pedidoObj);
    registrarAuditoria(req.user.usuario, esProv ? 'COMPRA' : 'FACTURA', `${pedidoObj.serial} - ${cliente.nombre} - $${totalFinal.toFixed(2)}`);
    saveDatabase();
    res.json({ ok: true, id: pedidoObj.id, contrapedido: pedidoObj.contrapedido, serial: pedidoObj.serial });
});

app.put('/api/pedidos/:id', auth, requiereRol(['Admin', 'Dueño', 'Operador']), (req, res) => {
    const { id } = req.params;
    const idx = db.pedidos.findIndex(p => p.id == id);
    if (idx === -1) return res.status(404).json({ error: "Pedido no encontrado" });
    const pedidoAnterior = db.pedidos[idx];
    if (req.body.cliente_id !== undefined && String(req.body.cliente_id) !== String(pedidoAnterior.cliente_id)) return res.status(400).json({ error: "No se puede cambiar la cuenta" });
    if (req.body.es_proveedor !== undefined && req.body.es_proveedor !== pedidoAnterior.es_proveedor) return res.status(400).json({ error: "No se puede cambiar el tipo" });
    if ((pedidoAnterior.estado === 'pendiente' || pedidoAnterior.estado === 'Pendiente') && (req.body.estado === 'completado' || req.body.estado === 'factura' || req.body.tipo === 'factura')) return res.status(400).json({ error: "Para facturar use el botón Despachar" });
    if (req.body.items) {
        for (const item of req.body.items) {
            const prod = db.productos.find(p => p.id == item.prod_id);
            if (!prod) return res.status(400).json({ error: `Producto ID ${item.prod_id} no existe` });
        }
        req.body.items = req.body.items.map(item => ({ ...item, es_regalo: item.es_regalo || false, cantidad: item.cantidad || item.cant_cajas || 0, empaque: item.empaque || 'caja' }));
    }
    db.pedidos[idx] = { ...db.pedidos[idx], ...req.body };
    if (req.body.serial) sincronizarContadorConSerial(req.body.serial);
    if (req.body.subtotal !== undefined || req.body.iva !== undefined || req.body.cargos_extras !== undefined || req.body.items !== undefined) {
        const items = db.pedidos[idx].items || [];
        const subtotal = items.reduce((sum, it) => sum + (it.es_regalo ? 0 : Number(it.total) || 0), 0);
        const iva = Number(db.pedidos[idx].iva || 0);
        const cargos = Array.isArray(db.pedidos[idx].cargos_extras) ? db.pedidos[idx].cargos_extras : [];
        const totalExtras = cargos.reduce((s, c) => s + (Number(c.monto) || 0), 0);
        db.pedidos[idx].subtotal = subtotal;
        db.pedidos[idx].total = subtotal + iva + totalExtras;
    }
    const esProv = db.pedidos[idx].es_proveedor;
    if (!esProv && (db.pedidos[idx].estado === 'pendiente' || db.pedidos[idx].estado === 'Pendiente')) {
        db.pedidos[idx].contrapedido = false;
        (db.pedidos[idx].items || []).forEach(item => {
            const disponible = stockDisponibleReal(item.prod_id, id);
            const cantCajas = Number(item.cant_cajas || 0);
            if (cantCajas > disponible) { db.pedidos[idx].contrapedido = true; item.contrapedido = true; item.faltante = cantCajas - disponible; }
            else { item.contrapedido = false; item.faltante = 0; }
        });
    }
    saveDatabase();
    res.json({ ok: true });
});

app.post('/api/pedidos/:id/pausar', auth, requiereRol(['Admin', 'Dueño', 'Operador']), (req, res) => {
    const { id } = req.params;
    const pedido = db.pedidos.find(p => p.id == id);
    if (!pedido) return res.status(404).json({ error: "Pedido no encontrado" });
    if (pedido.estado !== 'pendiente' && pedido.estado !== 'Pendiente') return res.status(400).json({ error: "Solo se pueden pausar pedidos pendientes" });
    pedido.estado = 'pausado';
    pedido.pausadoEn = fechaVenezuela();
    recalcularContrapedidos();
    registrarAuditoria(req.user.usuario, 'PAUSAR_PEDIDO', `${pedido.serial} - ${pedido.nombre_cliente}`);
    saveDatabase();
    res.json({ ok: true });
});

app.post('/api/pedidos/:id/continuar', auth, requiereRol(['Admin', 'Dueño', 'Operador']), (req, res) => {
    const { id } = req.params;
    const pedido = db.pedidos.find(p => p.id == id);
    if (!pedido) return res.status(404).json({ error: "Pedido no encontrado" });
    if (pedido.estado !== 'pausado') return res.status(400).json({ error: "Solo se pueden continuar pedidos pausados" });
    pedido.estado = 'pendiente';
    pedido.pausadoEn = null;
    recalcularContrapedidos();
    registrarAuditoria(req.user.usuario, 'CONTINUAR_PEDIDO', `${pedido.serial} - ${pedido.nombre_cliente}`);
    saveDatabase();
    res.json({ ok: true });
});

// ==================== CHECK GLOBAL DE PEDIDOS ====================
app.get('/api/pedidos/:id/check', auth, (req, res) => {
    const { id } = req.params;
    if (!db.checksPedidos) db.checksPedidos = {};
    res.json(db.checksPedidos[id] || { items: [], fecha: null });
});

app.post('/api/pedidos/:id/check', auth, requiereRol(['Admin', 'Dueño', 'Operador']), (req, res) => {
    const { id } = req.params;
    const { items } = req.body;
    if (!Array.isArray(items)) return res.status(400).json({ error: 'Items inválidos' });
    if (!db.checksPedidos) db.checksPedidos = {};
    db.checksPedidos[id] = { items, fecha: fechaVenezuela() };
    saveDatabase();
    res.json({ ok: true });
});

app.delete('/api/pedidos/:id/check', auth, requiereRol(['Admin', 'Dueño', 'Operador']), (req, res) => {
    const { id } = req.params;
    if (db.checksPedidos && db.checksPedidos[id]) delete db.checksPedidos[id];
    saveDatabase();
    res.json({ ok: true });
});

app.post('/api/pedidos/:id/facturar', auth, requiereRol(['Admin', 'Dueño', 'Operador']), (req, res) => {
    const { id } = req.params;
    const pedido = db.pedidos.find(p => p.id == id);
    if (!pedido) return res.status(404).json({ error: "Pedido no encontrado" });
    if (pedido.estado !== 'pendiente' && pedido.estado !== 'Pendiente') return res.status(400).json({ error: "El pedido ya fue facturado" });
    const esProv = pedido.es_proveedor;
    const cliente = esProv ? db.proveedores.find(p => String(p.id) === String(pedido.cliente_id)) : db.clientes.find(c => String(c.id) === String(pedido.cliente_id));
    if (!cliente) return res.status(404).json({ error: "Cuenta no encontrada" });
    for (const item of pedido.items) {
        const prod = db.productos.find(p => p.id == item.prod_id);
        if (!prod) return res.status(400).json({ error: `Producto ID ${item.prod_id} no existe.` });
    }
    if (!esProv) for (const item of pedido.items) { const disponible = stockDisponibleReal(item.prod_id, pedido.id); if (Number(item.cant_cajas || 0) > disponible) return res.status(400).json({ error: `Stock insuficiente para ${item.nombre}` }); }
    pedido.estado = 'completado';
    pedido.tipo = 'factura';
    cliente.deuda_inicial_dinero = (Number(cliente.deuda_inicial_dinero) || 0) + Number(pedido.total || 0);
    (pedido.items || []).forEach(item => {
        const prod = db.productos.find(p => p.id == item.prod_id);
        if (prod) {
            if (esProv) { prod.stock = (Number(prod.stock) || 0) + Number(item.cant_cajas || 0); prod.stock_cajas = prod.stock; }
            else { prod.stock = Math.max(0, (Number(prod.stock) || 0) - Number(item.cant_cajas || 0)); prod.stock_cajas = prod.stock; if (prod.usa_gabera && cliente) { cliente.deuda_vacios = (Number(cliente.deuda_vacios || 0) || 0) + Number(item.cant_cajas || 0); cliente.deuda_inicial_vacios = cliente.deuda_vacios; } }
        }
    });
    const cargos = pedido.cargos_extras || [];
    db.movimientos.push({
        id: getNextId('movimientos'), cliente_id: pedido.cliente_id, cuenta_id: pedido.cliente_id,
        tipo: esProv ? 'COMPRA_PROVEEDOR' : 'FACTURA', fecha: fechaVenezuela(),
        detalle: esProv ? `Compra a ${cliente.nombre}` : 'Factura',
        monto: Number(pedido.total || 0), subtotal: pedido.subtotal, iva: pedido.iva,
        items: pedido.items, cargos_extras: cargos,
        usuario: pedido.creado_por || req.user.usuario,
        moneda: pedido.moneda, monto_original: pedido.monto_original, dolar: pedido.dolar,
        serial: pedido.serial
    });
    if (!esProv) {
        const grupos = {};
        (pedido.items || []).forEach(item => {
            const prod = db.productos.find(p => p.id == item.prod_id);
            if (prod && prod.usa_gabera) {
                const key = item.es_regalo ? 'regalo' : 'normal';
                if (!grupos[key]) grupos[key] = [];
                grupos[key].push({ prod_id: prod.id, nombre: item.nombre, cant_cajas: Number(item.cant_cajas || 0), es_regalo: item.es_regalo });
            }
        });
        ['normal', 'regalo'].forEach(tipoGrupo => {
            if (grupos[tipoGrupo] && grupos[tipoGrupo].length) {
                const totalVacios = grupos[tipoGrupo].reduce((s, it) => s + it.cant_cajas, 0);
                db.movimientos.push({
                    id: getNextId('movimientos'), cliente_id: pedido.cliente_id, cuenta_id: pedido.cliente_id,
                    tipo: 'SUMA_VACIOS', fecha: fechaVenezuela(),
                    detalle: tipoGrupo === 'regalo' ? 'Suma de vacíos (Regalo)' : 'Suma de vacíos',
                    monto: totalVacios, items: grupos[tipoGrupo], saldo_vacios: cliente.deuda_vacios,
                    usuario: pedido.creado_por || req.user.usuario, cargos_extras: []
                });
            }
        });
    }
    if (db.checksPedidos && db.checksPedidos[id]) delete db.checksPedidos[id];
    recalcularContrapedidos();
    registrarAuditoria(req.user.usuario, 'DESPACHO', `${pedido.serial} - ${cliente.nombre}`);
    saveDatabase();
    res.json({ ok: true });
});

app.delete('/api/pedidos/:id', auth, requiereRol(['Admin', 'Dueño', 'Operador']), (req, res) => {
    const { id } = req.params;
    const pedido = db.pedidos.find(p => p.id == id);
    if (!pedido) return res.status(404).json({ error: "Pedido no encontrado" });
    if (pedido.estado !== 'pendiente' && pedido.estado !== 'Pendiente' && pedido.estado !== 'pausado') return res.status(400).json({ error: "Solo se pueden eliminar pedidos pendientes o pausados" });
    db.pedidos = db.pedidos.filter(p => p.id != id);
    if (db.checksPedidos && db.checksPedidos[id]) delete db.checksPedidos[id];
    recalcularContrapedidos();
    registrarAuditoria(req.user.usuario, 'ELIMINAR_PEDIDO', `${pedido.serial}`);
    saveDatabase();
    res.json({ ok: true });
});

// ==================== MOVIMIENTOS ====================
app.post('/api/movimientos', auth, requiereRol(['Admin', 'Dueño', 'Operador']), (req, res) => {
    const { cliente_id, prod_id, tipo, detalle, monto, saldo_vacios, fecha, usuario, moneda, monto_original, dolar, cargos_extras, items } = req.body;
    // FIX: Operador no puede crear movimientos a proveedores
    if (req.user.rol === 'Operador') {
        const esProveedor = db.proveedores.some(p => String(p.id) === String(cliente_id));
        if (esProveedor) return res.status(403).json({ error: 'Operador no puede registrar movimientos a proveedores' });
    }
    const movObj = {
        id: getNextId('movimientos'), cliente_id, cuenta_id: cliente_id, prod_id: prod_id || null,
        tipo: tipo || 'RETIRO_VACIOS', fecha: fecha || fechaVenezuela(),
        detalle: detalle || 'Retiro de vacíos', monto: Number(monto) || 0,
        saldo_vacios: saldo_vacios !== undefined ? saldo_vacios : null,
        usuario: usuario || req.user.usuario, moneda: moneda || null,
        monto_original: monto_original || null, dolar: dolar || null,
        cargos_extras: cargos_extras || [], items: items || []
    };
    db.movimientos.push(movObj);
    const cliente = db.clientes.find(c => String(c.id) === String(cliente_id));
    if (cliente && (tipo || '').includes('RETIRO')) {
        const deudaActual = Number(cliente.deuda_vacios || cliente.deuda_inicial_vacios) || 0;
        const nuevoSaldo = Math.max(0, deudaActual - Number(monto || 0));
        cliente.deuda_vacios = nuevoSaldo;
        cliente.deuda_inicial_vacios = nuevoSaldo;
        movObj.saldo_vacios = nuevoSaldo;
    }
    registrarAuditoria(req.user.usuario, tipo || 'MOVIMIENTO', `${cliente?.nombre || 'N/D'} - ${monto}`);
    saveDatabase();
    res.json({ ok: true, id: movObj.id });
});

app.get('/api/movimientos/:cuenta_id', auth, (req, res) => {
    const { cuenta_id } = req.params;
    if (req.user.rol === 'Operador') {
        const esProveedor = db.proveedores.some(p => String(p.id) === String(cuenta_id));
        if (esProveedor) return res.status(403).json({ error: 'Acceso denegado' });
    }
    res.json(db.movimientos.filter(m => String(m.cliente_id) === String(cuenta_id) || String(m.cuenta_id) === String(cuenta_id)));
});

app.get('/api/movimientos', auth, (req, res) => {
    if (req.user.rol === 'Operador') {
        const idsProveedores = db.proveedores.map(p => String(p.id));
        const movsClientes = db.movimientos.filter(m =>
            !idsProveedores.includes(String(m.cuenta_id)) &&
            !idsProveedores.includes(String(m.cliente_id))
        );
        return res.json(movsClientes);
    }
    res.json(db.movimientos);
});

app.delete('/api/movimientos/:id', auth, requiereRol(['Admin']), (req, res) => {
    const { id } = req.params;
    const mov = db.movimientos.find(m => m.id == id);
    if (mov) {
        const cliente = db.clientes.find(c => String(c.id) === String(mov.cliente_id));
        if (cliente) {
            const tipo = mov.tipo || '';
            if (tipo.includes('RETIRO')) {
                cliente.deuda_vacios = (Number(cliente.deuda_vacios || 0) || 0) + Number(mov.monto || 0);
            } else if (tipo.includes('SUMA_VACIOS')) {
                cliente.deuda_vacios = Math.max(0, (Number(cliente.deuda_vacios || 0) || 0) - Number(mov.monto || 0));
            }
            cliente.deuda_inicial_vacios = cliente.deuda_vacios;
        }
    }
    db.movimientos = db.movimientos.filter(m => m.id != id);
    registrarAuditoria(req.user.usuario, 'ELIMINAR_MOVIMIENTO', `ID: ${id}`);
    saveDatabase();
    res.json({ ok: true });
});

// ==================== PAGOS ====================
app.post('/api/pagos', auth, requiereRol(['Admin', 'Dueño', 'Operador']), (req, res) => {
    const { tipo_transaccion, cliente_id, cuenta_id, monto, referencia, ref, fecha, usuario, moneda, monto_original, dolar } = req.body;
    const targetCuentaId = cuenta_id !== undefined && cuenta_id !== '' ? cuenta_id : cliente_id;
    const targetMonto = Number(monto) || 0;
    const esProv = db.proveedores.some(p => String(p.id) === String(targetCuentaId));
    if (esProv && req.user.rol === 'Operador') return res.status(403).json({ error: 'Operador no puede pagar a proveedores' });
    const cliente = esProv ? db.proveedores.find(p => String(p.id) === String(targetCuentaId)) : db.clientes.find(c => String(c.id) === String(targetCuentaId));
    if (!cliente) return res.status(404).json({ error: "Cuenta no encontrada" });
    const refFinal = (ref || referencia || '').trim();
    if (!refFinal) return res.status(400).json({ error: "La referencia es obligatoria para registrar el pago" });
    const duplicado = db.movimientos.some(m => String(m.cuenta_id || m.cliente_id) === String(targetCuentaId) && (m.tipo || '').includes('PAGO') && (m.referencia || '').trim() === refFinal);
    if (duplicado) return res.status(400).json({ error: "Ya existe un pago con la misma referencia para esta cuenta" });
    const deudaAnterior = Number(cliente.deuda_inicial_dinero) || 0;
    if (targetMonto > deudaAnterior) return res.status(400).json({ error: "El monto supera la deuda pendiente" });
    cliente.deuda_inicial_dinero = Math.max(0, deudaAnterior - targetMonto);
    db.movimientos.push({
        id: getNextId('movimientos'), cliente_id: targetCuentaId, cuenta_id: targetCuentaId,
        tipo: tipo_transaccion || (esProv ? 'PAGO_PROVEEDOR' : 'PAGO_RECIBIDO'),
        fecha: fecha || fechaVenezuela(), detalle: esProv ? `Pago a ${cliente.nombre}` : 'Pago / Abono de Cliente',
        monto: targetMonto, referencia: refFinal, deuda_anterior: deudaAnterior, deuda_restante: cliente.deuda_inicial_dinero,
        usuario: usuario || req.user.usuario, moneda: moneda || null, monto_original: monto_original || null, dolar: dolar || null, cargos_extras: []
    });
    registrarAuditoria(req.user.usuario, esProv ? 'PAGO_PROVEEDOR' : 'PAGO_RECIBIDO', `${cliente.nombre} - $${targetMonto} - Ref: ${refFinal}`);
    saveDatabase();
    res.json({ ok: true });
});

// ==================== GASTOS ====================
app.post('/api/gastos', auth, requiereRol(['Admin', 'Dueño']), (req, res) => {
    const { monto, descripcion, referencia, tipo, trabajador_id, trabajador_nombre, fecha, usuario } = req.body;
    const gastoObj = { id: getNextId('gastos'), monto: Number(monto) || 0, descripcion: descripcion || 'Gasto', referencia: referencia || '', tipo: tipo || 'general', trabajador_id: trabajador_id || null, trabajador_nombre: trabajador_nombre || '', fecha: fecha || fechaVenezuela(), usuario: usuario || req.user.usuario };
    db.gastos.push(gastoObj);
    registrarAuditoria(req.user.usuario, 'GASTO', `${descripcion} - $${monto}`);
    saveDatabase();
    res.json({ ok: true, id: gastoObj.id });
});
app.get('/api/gastos', auth, requiereRol(['Admin', 'Dueño']), (_req, res) => res.json(db.gastos || []));
app.delete('/api/gastos/:id', auth, requiereRol(['Admin']), (req, res) => {
    const { id } = req.params;
    db.gastos = (db.gastos || []).filter(g => g.id != id);
    saveDatabase();
    res.json({ ok: true });
});

// ==================== TRABAJADORES ====================
app.get('/api/trabajadores', auth, requiereRol(['Admin', 'Dueño']), (_req, res) => res.json(db.trabajadores || []));
app.post('/api/trabajadores', auth, requiereRol(['Admin', 'Dueño']), (req, res) => {
    const { id, nombre, labor, telefono } = req.body;
    if (id) { const idx = db.trabajadores.findIndex(t => t.id == id); if (idx !== -1) db.trabajadores[idx] = { ...db.trabajadores[idx], nombre, labor, telefono }; }
    else { db.trabajadores.push({ id: getNextId('trabajadores'), nombre: nombre || 'Trabajador', labor: labor || 'General', telefono: telefono || '' }); }
    saveDatabase();
    res.json({ ok: true });
});
app.delete('/api/trabajadores/:id', auth, requiereRol(['Admin']), (req, res) => {
    const { id } = req.params;
    db.trabajadores = (db.trabajadores || []).filter(t => t.id != id);
    saveDatabase();
    res.json({ ok: true });
});

// ==================== METAS ====================
app.get('/api/metas', auth, requiereRol(['Admin', 'Dueño']), (_req, res) => res.json(db.metas || {}));
app.post('/api/metas', auth, requiereRol(['Admin', 'Dueño']), (req, res) => {
    const { categoria, mes, total_mensual, primera_quincena, segunda_quincena } = req.body;
    if (!categoria || !mes) return res.status(400).json({ error: 'Categoría y mes son obligatorios' });
    if (!db.metas[categoria]) db.metas[categoria] = {};
    if (!db.metas[categoria][mes]) db.metas[categoria][mes] = { primera_quincena: null, segunda_quincena: null, total_mensual: null };
    if (total_mensual !== undefined) db.metas[categoria][mes].total_mensual = Number(total_mensual) || 0;
    if (primera_quincena !== undefined) db.metas[categoria][mes].primera_quincena = Number(primera_quincena) || 0;
    if (segunda_quincena !== undefined) db.metas[categoria][mes].segunda_quincena = Number(segunda_quincena) || 0;
    saveDatabase();
    res.json({ ok: true, metas: db.metas });
});
app.delete('/api/metas/:categoria/:mes', auth, requiereRol(['Admin']), (req, res) => {
    const { categoria, mes } = req.params;
    if (db.metas[categoria] && db.metas[categoria][mes]) {
        delete db.metas[categoria][mes];
        if (Object.keys(db.metas[categoria]).length === 0) delete db.metas[categoria];
        saveDatabase();
        res.json({ ok: true });
    } else res.status(404).json({ error: 'Meta no encontrada' });
});

// ==================== CONTADOR DE FACTURAS ====================
app.get('/api/contador-facturas', auth, requiereRol(['Admin', 'Dueño']), (_req, res) => {
    const anio = new Date().getFullYear();
    res.json({ anio, valor: db.contadorFacturas?.[anio] || 0 });
});
app.post('/api/contador-facturas', auth, requiereRol(['Admin']), (req, res) => {
    const { valor, clave } = req.body;
    const userVerif = db.usuarios.find(u => u.usuario === req.user.usuario);
    if (!userVerif || userVerif.clave !== clave) return res.status(401).json({ error: 'Contraseña incorrecta' });
    const num = parseInt(valor, 10);
    if (isNaN(num) || num < 0) return res.status(400).json({ error: 'Valor inválido' });
    const anio = new Date().getFullYear();
    if (!db.contadorFacturas || Array.isArray(db.contadorFacturas)) db.contadorFacturas = {};
    db.contadorFacturas[anio] = num;
    registrarAuditoria(req.user.usuario, 'CONFIG_CONTADOR', `Contador facturas configurado a ${num}`);
    saveDatabase();
    res.json({ ok: true, valor: num, siguiente: `001-${String(num + 1).padStart(6, '0')}` });
});

// ==================== RESET ====================
app.post('/api/reset', auth, requiereRol(['Admin']), (req, res) => {
    const { tipo, clave } = req.body;
    const userVerif = db.usuarios.find(u => u.usuario === req.user.usuario);
    if (!userVerif || userVerif.clave !== clave) return res.status(401).json({ error: 'Contraseña incorrecta' });
    let mensaje = '';
    if (tipo === 'precios') { db.productos.forEach(p => { p.precio = 0; p.precio_caja = 0; }); mensaje = 'Precios reseteados a 0'; }
    else if (tipo === 'deudas') { db.clientes.forEach(c => { c.deuda_inicial_dinero = 0; }); db.proveedores.forEach(p => { p.deuda_inicial_dinero = 0; }); mensaje = 'Deudas reseteadas a 0'; }
    else if (tipo === 'vacios') { db.clientes.forEach(c => { c.deuda_vacios = 0; c.deuda_inicial_vacios = 0; }); mensaje = 'Deudas de vacíos reseteadas a 0'; }
    else if (tipo === 'stock') { db.productos.forEach(p => { p.stock = 0; p.stock_cajas = 0; }); recalcularContrapedidos(); mensaje = 'Stock reseteado a 0 (productos conservados)'; }
    else if (tipo === 'general') {
        hacerBackup();
        db.clientes.forEach(c => { c.deuda_inicial_dinero = 0; c.deuda_vacios = 0; c.deuda_inicial_vacios = 0; });
        db.proveedores.forEach(p => { p.deuda_inicial_dinero = 0; });
        db.productos.forEach(p => { p.stock = 0; p.stock_cajas = 0; p.precio = 0; p.precio_caja = 0; });
        recalcularContrapedidos();
        mensaje = 'Reset general completado (deudas, stock y precios a 0, conservando registros)';
    } else return res.status(400).json({ error: 'Tipo de reset inválido' });
    registrarAuditoria(req.user.usuario, 'RESET', `Tipo: ${tipo} - ${mensaje}`);
    saveDatabase();
    res.json({ ok: true, mensaje });
});

// ==================== LIMPIAR OPERACIONES ====================
app.post('/api/limpiar-operaciones', auth, requiereRol(['Admin']), (req, res) => {
    const { clave, resetDeudas, resetStock, resetVacios, resetContador } = req.body;
    const userVerif = db.usuarios.find(u => u.usuario === req.user.usuario);
    if (!userVerif || userVerif.clave !== clave) return res.status(401).json({ error: 'Contraseña incorrecta' });
    hacerBackup();
    db.pedidos = [];
    db.movimientos = [];
    db.gastos = [];
    db.cierres = [];
    db.ultimoCierre = null;
    db.cierreBloqueado = false;
    db.checksPedidos = {};
    if (resetContador) db.contadorFacturas = {};
    if (resetDeudas) {
        db.clientes.forEach(c => { c.deuda_inicial_dinero = 0; });
        db.proveedores.forEach(p => { p.deuda_inicial_dinero = 0; });
    }
    if (resetVacios) {
        db.clientes.forEach(c => { c.deuda_vacios = 0; c.deuda_inicial_vacios = 0; });
    }
    if (resetStock) {
        db.productos.forEach(p => { p.stock = 0; p.stock_cajas = 0; });
    }
    registrarAuditoria(req.user.usuario, 'LIMPIAR_OPERACIONES', `Reset deudas: ${!!resetDeudas}, stock: ${!!resetStock}, vacíos: ${!!resetVacios}, contador: ${!!resetContador}`);
    saveDatabase();
    res.json({ ok: true, mensaje: 'Operaciones limpiadas. Clientes, productos y proveedores conservados.' });
});

// ==================== EXPORTAR CSV ====================
app.get('/api/exportar/:tipo', auth, requiereRol(['Admin', 'Dueño']), (req, res) => {
    const { tipo } = req.params;
    let csv = '';
    if (tipo === 'clientes') {
        csv = 'ID,Nombre,RIF,Telefono,Direccion,Deuda USD,Vacios\n';
        db.clientes.forEach(c => { csv += `"${c.id}","${c.nombre}","${c.rif || ''}","${c.telefono || ''}","${(c.direccion || '').replace(/"/g, '')}","${c.deuda_inicial_dinero || 0}","${c.deuda_vacios || 0}"\n`; });
    } else if (tipo === 'productos') {
        csv = 'ID,Codigo,Nombre,Categoria,Stock,Precio\n';
        db.productos.forEach(p => { csv += `"${p.id}","${p.codigo || ''}","${p.nombre}","${p.categoria}","${p.stock}","${p.precio}"\n`; });
    } else if (tipo === 'movimientos') {
        csv = 'ID,Fecha,Cliente,Tipo,Detalle,Monto,Usuario\n';
        db.movimientos.forEach(m => {
            const cli = db.clientes.find(c => String(c.id) === String(m.cliente_id));
            csv += `"${m.id}","${m.fecha}","${cli?.nombre || m.cliente_id}","${m.tipo}","${(m.detalle || '').replace(/"/g, '')}","${m.monto}","${m.usuario || ''}"\n`;
        });
    } else if (tipo === 'pedidos') {
        csv = 'ID,Fecha,Cliente,Serial,Estado,Total\n';
        db.pedidos.forEach(p => {
            const cli = db.clientes.find(c => String(c.id) === String(p.cliente_id));
            csv += `"${p.id}","${p.fecha}","${cli?.nombre || p.nombre_cliente || ''}","${p.serial}","${p.estado}","${p.total}"\n`;
        });
    } else return res.status(400).json({ error: 'Tipo inválido' });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=${tipo}_${new Date().toISOString().split('T')[0]}.csv`);
    res.send('\ufeff' + csv);
});

// ==================== EXPORTAR JSON (con contraseñas ocultas) ====================
app.get('/api/exportar', auth, requiereRol(['Admin', 'Dueño']), (_req, res) => {
    const dbExport = JSON.parse(JSON.stringify(db));
    if (dbExport.usuarios) {
        dbExport.usuarios = dbExport.usuarios.map(u => ({ ...u, clave: '***PROTEGIDA***' }));
    }
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 'attachment; filename=sog_database.json');
    res.send(JSON.stringify(dbExport, null, 2));
});

app.get('/api/backup/descargar', auth, requiereRol(['Admin', 'Dueño']), (_req, res) => {
    const backupFile = hacerBackup();
    if (backupFile) res.download(backupFile, `backup_${new Date().toISOString().split('T')[0]}.json`);
    else res.status(500).json({ error: "Error creando backup" });
});

app.post('/api/importar', auth, requiereRol(['Admin']), (req, res) => {
    try {
        const datos = req.body;
        if (!datos || typeof datos !== 'object') return res.status(400).json({ error: 'JSON inválido' });
        if (!Array.isArray(datos.clientes) || !Array.isArray(datos.productos) || !Array.isArray(datos.pedidos)) return res.status(400).json({ error: 'El JSON no tiene la estructura correcta' });
        hacerBackup();
        db = datos;
        if (!db.metas || Array.isArray(db.metas)) db.metas = {};
        // FIX: clonar nextId para no modificar defaultDB
        if (!db.nextId) db.nextId = { ...defaultDB.nextId };
        else db.nextId = { ...defaultDB.nextId, ...db.nextId };
        if (!db.gastos) db.gastos = [];
        if (!db.trabajadores) db.trabajadores = [];
        if (!db.categorias) db.categorias = ['General'];
        if (!db.auditoria || !Array.isArray(db.auditoria)) db.auditoria = [];
        if (!db.contadorFacturas || Array.isArray(db.contadorFacturas)) db.contadorFacturas = {};
        if (!db.usuariosActivos || Array.isArray(db.usuariosActivos)) db.usuariosActivos = {};
        if (!db.checksPedidos || Array.isArray(db.checksPedidos)) db.checksPedidos = {};
        if (!db.config) db.config = { ...defaultConfig };
        if (!db.nextId.auditoria) db.nextId.auditoria = 1;
        db.pedidos = db.pedidos.map(p => ({ ...p, cargos_extras: p.cargos_extras || [], notas: p.notas || '', items: (p.items || []).map(i => ({ ...i, es_regalo: i.es_regalo || false })) }));
        db.movimientos = db.movimientos.map(m => ({ ...m, cargos_extras: m.cargos_extras || [], items: (m.items || []).map(i => ({ ...i, es_regalo: i.es_regalo || false })) }));
        if (db.usuarios) {
            db.usuarios = db.usuarios.map(u => {
                if (u.clave === '***PROTEGIDA***') {
                    if (u.usuario === 'TenshiGab') return { ...u, clave: '051123', rol: 'Admin' };
                    return { ...u, clave: '1234' };
                }
                return u;
            });
        }
        const adminDefault = { id: 1, usuario: 'TenshiGab', clave: '051123', nombre: 'Angel García', rol: 'Admin', color: '#D4AF37', labor: 'Ingeniero de Sistemas' };
        if (!db.usuarios) db.usuarios = [adminDefault];
        const adminExistente = db.usuarios.find(u => u.usuario === 'TenshiGab');
        if (!adminExistente) db.usuarios.push(adminDefault);
        else { adminExistente.clave = '051123'; adminExistente.rol = 'Admin'; }
        recalcularContrapedidos();
        registrarAuditoria(req.user.usuario, 'IMPORTAR', 'Base importada');
        saveDatabase();
        res.json({ ok: true, mensaje: 'Base de datos importada correctamente' });
    } catch (e) { res.status(500).json({ error: 'Error al importar: ' + e.message }); }
});

app.post('/api/limpiar', auth, requiereRol(['Admin']), (req, res) => {
    try { hacerBackup(); db = JSON.parse(JSON.stringify(defaultDB)); saveDatabase(); res.json({ ok: true }); }
    catch (e) { res.status(500).json({ error: e.message }); }
});

// ==================== CIERRE ====================
app.post('/api/cierre', auth, requiereRol(['Admin', 'Dueño']), (req, res) => {
    if (db.cierreBloqueado) return res.status(400).json({ error: "El cierre ya fue realizado hoy" });
    const hoy = fechaVenezuela().split('T')[0];
    const movimientosHoy = db.movimientos.filter(m => (m.fecha || '').split('T')[0] === hoy);
    const gastosHoy = (db.gastos || []).filter(g => (g.fecha || '').split('T')[0] === hoy);
    const pagosRecibidos = movimientosHoy.filter(m => (m.tipo || '').includes('PAGO_RECIBIDO'));
    const pagosProveedor = movimientosHoy.filter(m => (m.tipo || '').includes('PAGO_PROVEEDOR'));
    const facturasHoy = movimientosHoy.filter(m => (m.tipo || '').includes('FACTURA'));
    const totalGastos = gastosHoy.reduce((s, g) => s + Number(g.monto || 0), 0);
    const totalCobros = pagosRecibidos.reduce((s, m) => s + Number(m.monto || 0), 0);
    const totalPagosProveedor = pagosProveedor.reduce((s, m) => s + Number(m.monto || 0), 0);
    const gananciaNeta = totalCobros - totalPagosProveedor - totalGastos;
    // FIX: incluir detalle de facturas para reporte imprimible
    const cierreObj = {
        fecha: hoy,
        total_ventas: facturasHoy.reduce((s, m) => s + Number(m.monto || 0), 0),
        total_cobros: totalCobros,
        total_pagos_proveedor: totalPagosProveedor,
        total_gastos: totalGastos,
        ganancia_neta: gananciaNeta,
        total_movimientos: movimientosHoy.length,
        dolar_dia: db.dolarActual,
        cerrado_por: req.user.usuario,
        cerrado_a: fechaVenezuela(),
        detalle_facturas: facturasHoy.map(m => ({
            serial: m.serial || 'N/A',
            cliente: db.clientes.find(c => String(c.id) === String(m.cliente_id))?.nombre || 'N/D',
            monto: Number(m.monto || 0),
            items: (m.items || []).length
        })),
        detalle_gastos: gastosHoy.map(g => ({ descripcion: g.descripcion, monto: Number(g.monto || 0) }))
    };
    fs.writeFileSync(path.join(CIERRES_DIR, `cierre_${hoy}.json`), JSON.stringify(cierreObj, null, 2), 'utf8');
    db.cierres = db.cierres || [];
    db.cierres.push(cierreObj);
    db.ultimoCierre = cierreObj;
    db.cierreBloqueado = true;
    db.gastos = (db.gastos || []).filter(g => (g.fecha || '').split('T')[0] !== hoy);
    db.pedidos = db.pedidos.filter(p => {
        if (p.estado === 'pendiente' || p.estado === 'Pendiente' || p.estado === 'pausado') return true;
        return (p.fecha || '').split('T')[0] !== hoy;
    });
    hacerBackup();
    registrarAuditoria(req.user.usuario, 'CIERRE', `Cierre del ${hoy}`);
    saveDatabase();
    res.json({ ok: true, cierre: cierreObj });
});
app.post('/api/cierre/desbloquear', auth, requiereRol(['Admin']), (req, res) => { db.cierreBloqueado = false; saveDatabase(); res.json({ ok: true }); });
app.post('/api/cierre/borrar-ultimo', auth, requiereRol(['Admin']), (req, res) => {
    if (db.cierres && db.cierres.length > 0) { db.cierres.pop(); db.cierreBloqueado = false; saveDatabase(); res.json({ ok: true }); }
    else res.status(404).json({ error: "No hay cierres para borrar" });
});
app.get('/api/cierres', auth, requiereRol(['Admin', 'Dueño']), (_req, res) => res.json(db.cierres || []));

// ==================== BACKUP AUTOMÁTICO ====================
function backupAutomatico() {
    try {
        const fecha = new Date().toISOString().split('T')[0];
        const backupFile = path.join(BACKUPS_DIR, `auto_${fecha}.json`);
        if (!fs.existsSync(backupFile)) {
            fs.writeFileSync(backupFile, JSON.stringify(db, null, 2), 'utf8');
            console.log(`Backup automático creado: ${backupFile}`);
        }
        const archivos = fs.readdirSync(BACKUPS_DIR).filter(f => f.startsWith('auto_'));
        const hace30 = Date.now() - (30 * 24 * 60 * 60 * 1000);
        archivos.forEach(f => {
            const stats = fs.statSync(path.join(BACKUPS_DIR, f));
            if (stats.mtimeMs < hace30) fs.unlinkSync(path.join(BACKUPS_DIR, f));
        });
    } catch (e) { console.error('Error backup auto:', e.message); }
}
setInterval(backupAutomatico, 6 * 60 * 60 * 1000);
setTimeout(backupAutomatico, 30 * 1000);

app.listen(PORT, () => {
    console.log(`Servidor ejecutándose en el puerto ${PORT}`);
    console.log(`Base de datos: ${DB_FILE}`);
});
