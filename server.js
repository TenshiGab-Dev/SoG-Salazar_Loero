/**
 * SoG - System of Gestión (Versión 1.3.3)
 * Comercializadora Salazar Loero C.A.
 * Dev: TenshiGab
 * Contacto: gabriel.aguilar190707@gmail.com
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

const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'sog_database.json');
const CIERRES_DIR = path.join(DATA_DIR, 'cierres');
const BACKUPS_DIR = path.join(DATA_DIR, 'backups');
const METAS_DIR = path.join(DATA_DIR, 'metas');

[DATA_DIR, CIERRES_DIR, BACKUPS_DIR, METAS_DIR].forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

const defaultDB = {
    clientes: [],
    proveedores: [
        {
            id: 0,
            rif: 'J-00000000-0',
            nombre: 'ALIMENTOS POLAR / PROV',
            telefono: '0800-POLAR',
            direccion: 'Planta / Agencia Central',
            deuda_inicial_dinero: 0,
            deuda_vacios: 0,
            deuda_inicial_vacios: 0,
            categorias: ['Alimentos']
        }
    ],
    productos: [],
    pedidos: [],
    movimientos: [],
    gastos: [],
    trabajadores: [],
    usuarios: [
        { id: 1, usuario: 'TenshiGab', clave: '051123', nombre: 'Angel García', rol: 'Admin', color: '#D4AF37', labor: 'Ingeniero de Sistemas' }
    ],
    cierres: [],
    ultimoCierre: null,
    cierreBloqueado: false,
    dolarActual: null,
    categorias: ['General'],
    metas: {},
    nextId: { clientes: 1, proveedores: 1, productos: 1, pedidos: 1, movimientos: 1, gastos: 1, trabajadores: 1, usuarios: 2 }
};

let db = loadDatabase();

function loadDatabase() {
    try {
        if (fs.existsSync(DB_FILE)) {
            const parsed = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
            if (!parsed.proveedores) parsed.proveedores = [];
            if (!parsed.proveedores.some(p => Number(p.id) === 0)) {
                parsed.proveedores.unshift({
                    id: 0, rif: 'J-00000000-0', nombre: 'ALIMENTOS POLAR / PROV', telefono: '0800-POLAR',
                    direccion: 'Planta / Agencia Central', deuda_inicial_dinero: 0, deuda_vacios: 0,
                    deuda_inicial_vacios: 0, categorias: ['Alimentos']
                });
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
            if (!parsed.nextId) parsed.nextId = defaultDB.nextId;
            if (parsed.dolarActual === undefined || parsed.dolarActual === null) parsed.dolarActual = null;
            if (!parsed.metas) parsed.metas = {};
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
    const backupFile = path.join(BACKUPS_DIR, `backup_${fecha}.json`);
    try { fs.writeFileSync(backupFile, JSON.stringify(db, null, 2), 'utf8'); return backupFile; }
    catch (e) { console.error("Error backup:", e.message); return null; }
}

function fechaVenezuela() {
    const ahora = new Date();
    const offset = -4 * 60;
    return new Date(ahora.getTime() + (offset * 60 * 1000)).toISOString();
}

// Middleware de autenticación simple
function auth(req, res, next) {
    const authHeader = req.headers.authorization || '';
    if (!authHeader.startsWith('Basic ')) return res.status(401).json({ error: 'No autorizado' });
    const token = Buffer.from(authHeader.slice(6), 'base64').toString();
    const [usuario, clave] = token.split(':');
    const user = db.usuarios.find(u => u.usuario === usuario && u.clave === clave);
    if (!user) return res.status(401).json({ error: 'Credenciales inválidas' });
    req.user = user;
    next();
}

function requiereRol(roles) {
    return (req, res, next) => {
        if (!req.user) return res.status(401).json({ error: 'No autenticado' });
        if (roles.includes(req.user.rol) || req.user.rol === 'Admin') return next();
        return res.status(403).json({ error: 'Acceso denegado' });
    };
}

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ============ AUTH ============
app.post('/api/login', (req, res) => {
    const { usuario, clave } = req.body;
    const user = db.usuarios.find(u => u.usuario === usuario && u.clave === clave);
    if (user) {
        return res.json({
            ok: true,
            token: Buffer.from(`${user.usuario}:${user.clave}`).toString('base64'),
            user: { id: user.id, usuario: user.usuario, nombre: user.nombre, rol: user.rol, color: user.color, labor: user.labor }
        });
    }
    res.status(401).json({ error: "Credenciales inválidas" });
});

app.get('/api/auth/session', auth, (req, res) => {
    res.json({ ok: true, user: req.user });
});

app.post('/api/logout', (_req, res) => res.json({ ok: true }));

// Usuarios
app.get('/api/usuarios', auth, requiereRol(['Admin']), (_req, res) => {
    res.json(db.usuarios.map(u => ({ id: u.id, usuario: u.usuario, nombre: u.nombre, rol: u.rol, color: u.color, labor: u.labor })));
});

app.post('/api/usuarios', auth, requiereRol(['Admin']), (req, res) => {
    const { id, usuario, clave, nombre, rol, color, labor } = req.body;
    if (id) {
        const idx = db.usuarios.findIndex(u => u.id == id);
        if (idx !== -1) {
            db.usuarios[idx] = { ...db.usuarios[idx], usuario: usuario || db.usuarios[idx].usuario, nombre: nombre || db.usuarios[idx].nombre, rol: rol || db.usuarios[idx].rol, color: color || db.usuarios[idx].color, labor: labor || db.usuarios[idx].labor };
            if (clave) db.usuarios[idx].clave = clave;
        }
    } else {
        db.usuarios.push({ id: getNextId('usuarios'), usuario: usuario || 'usuario', clave: clave || '1234', nombre: nombre || usuario || 'Usuario', rol: rol || 'Operador', color: color || '#D4AF37', labor: labor || '' });
    }
    saveDatabase();
    res.json({ ok: true });
});

app.delete('/api/usuarios/:id', auth, requiereRol(['Admin']), (req, res) => {
    const { id } = req.params;
    if (Number(id) === 1) return res.status(400).json({ error: "No se puede eliminar al admin" });
    db.usuarios = db.usuarios.filter(u => u.id != id);
    saveDatabase();
    res.json({ ok: true });
});

// Proveedores
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
        if (idx !== -1) db.proveedores[idx] = provObj;
        else db.proveedores.push(provObj);
    } else {
        db.proveedores.push({ id: getNextId('proveedores'), rif: rif || '', nombre: nombre || 'Proveedor', telefono: telefono || '', direccion: direccion || '', deuda_inicial_dinero: Number(deuda_inicial_dinero) || 0, deuda_vacios: 0, deuda_inicial_vacios: 0, categorias: cats });
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
    db.proveedores = db.proveedores.filter(p => String(p.id) !== String(id));
    saveDatabase();
    res.json({ ok: true });
});

// Clientes
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
        if (idx !== -1) db.clientes[idx] = cliObj;
        else db.clientes.push(cliObj);
    } else {
        db.clientes.push({ id: getNextId('clientes'), rif: rif || '', nombre: nombre || 'Sin Nombre', telefono: telefono || '', direccion: direccion || '', deuda_inicial_dinero: Number(deuda_inicial_dinero) || 0, deuda_inicial_vacios: Number(deuda_inicial_vacios || deuda_vacios) || 0, deuda_vacios: Number(deuda_vacios || deuda_inicial_vacios) || 0 });
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
    db.clientes = db.clientes.filter(c => String(c.id) !== String(id));
    db.movimientos = db.movimientos.filter(m => String(m.cliente_id) !== String(id) && String(m.cuenta_id) !== String(id));
    db.pedidos = db.pedidos.filter(p => String(p.cliente_id) !== String(id));
    saveDatabase();
    res.json({ ok: true });
});

// Productos
app.get('/api/productos', auth, (_req, res) => res.json(db.productos));

app.post('/api/productos', auth, requiereRol(['Admin', 'Dueño', 'Operador']), (req, res) => {
    const { id, codigo, nombre, categoria, stock, stock_cajas, precio, precio_caja, unid_por_caja, unidades_por_caja, cajas_por_paleta, usa_gabera, exento_iva } = req.body;
    const prodObj = {
        id: id ? Number(id) : getNextId('productos'),
        codigo: codigo || '', nombre: nombre || 'Sin Nombre', categoria: categoria || 'General',
        stock: Number(stock || stock_cajas) || 0, stock_cajas: Number(stock || stock_cajas) || 0,
        precio: Number(precio || precio_caja) || 0, precio_caja: Number(precio || precio_caja) || 0,
        unid_por_caja: Number(unid_por_caja || unidades_por_caja) || 24, unidades_por_caja: Number(unid_por_caja || unidades_por_caja) || 24,
        cajas_por_paleta: Number(cajas_por_paleta) || 60, usa_gabera: Boolean(usa_gabera), exento_iva: Boolean(exento_iva)
    };
    const idx = db.productos.findIndex(p => p.id === prodObj.id);
    if (idx !== -1) db.productos[idx] = prodObj;
    else db.productos.push(prodObj);
    saveDatabase();
    res.json({ ok: true });
});

app.put('/api/productos/:id', auth, requiereRol(['Admin', 'Dueño', 'Operador']), (req, res) => {
    const { id } = req.params;
    const idx = db.productos.findIndex(p => p.id == id);
    if (idx !== -1) { db.productos[idx] = { ...db.productos[idx], ...req.body }; saveDatabase(); res.json({ ok: true }); }
    else res.status(404).json({ error: "Producto no encontrado" });
});

app.put('/api/productos/precio/:id', auth, requiereRol(['Admin', 'Dueño']), (req, res) => {
    const { id } = req.params;
    const { precio } = req.body;
    const idx = db.productos.findIndex(p => p.id == id);
    if (idx !== -1) { db.productos[idx].precio = Number(precio) || 0; db.productos[idx].precio_caja = Number(precio) || 0; saveDatabase(); res.json({ ok: true }); }
    else res.status(404).json({ error: "Producto no encontrado" });
});

app.put('/api/productos/rapido/:id', auth, requiereRol(['Admin', 'Dueño']), (req, res) => {
    const { id } = req.params;
    const { nombre, codigo, stock, precio, unid_por_caja, cajas_por_paleta, usa_gabera, exento_iva } = req.body;
    const idx = db.productos.findIndex(p => p.id == id);
    if (idx !== -1) {
        if (nombre !== undefined) db.productos[idx].nombre = nombre;
        if (codigo !== undefined) db.productos[idx].codigo = codigo;
        if (stock !== undefined) { db.productos[idx].stock = Number(stock) || 0; db.productos[idx].stock_cajas = Number(stock) || 0; }
        if (precio !== undefined) { db.productos[idx].precio = Number(precio) || 0; db.productos[idx].precio_caja = Number(precio) || 0; }
        if (unid_por_caja !== undefined) { db.productos[idx].unid_por_caja = Number(unid_por_caja) || 24; db.productos[idx].unidades_por_caja = Number(unid_por_caja) || 24; }
        if (cajas_por_paleta !== undefined) db.productos[idx].cajas_por_paleta = Number(cajas_por_paleta) || 60;
        if (usa_gabera !== undefined) db.productos[idx].usa_gabera = Boolean(usa_gabera);
        if (exento_iva !== undefined) db.productos[idx].exento_iva = Boolean(exento_iva);
        saveDatabase();
        res.json({ ok: true, producto: db.productos[idx] });
    } else res.status(404).json({ error: "Producto no encontrado" });
});

app.delete('/api/productos/:id', auth, requiereRol(['Admin']), (req, res) => {
    const { id } = req.params;
    db.productos = db.productos.filter(p => p.id != id);
    saveDatabase();
    res.json({ ok: true });
});

// Categorías
app.get('/api/categorias', auth, (req, res) => res.json(db.categorias || ['General']));

app.post('/api/categorias', auth, requiereRol(['Admin', 'Dueño']), (req, res) => {
    const { nombre } = req.body;
    if (nombre && !db.categorias.includes(nombre)) { db.categorias.push(nombre); saveDatabase(); }
    res.json({ ok: true, categorias: db.categorias });
});

app.put('/api/categorias/:nombre', auth, requiereRol(['Admin', 'Dueño']), (req, res) => {
    const { nombre } = req.params;
    const { nuevoNombre } = req.body;
    const idx = db.categorias.findIndex(c => c === nombre);
    if (idx !== -1) {
        db.categorias[idx] = nuevoNombre || nombre;
        db.productos.forEach(p => { if (p.categoria === nombre) p.categoria = nuevoNombre || nombre; });
        if (db.metas[nombre] && nuevoNombre) { db.metas[nuevoNombre] = db.metas[nombre]; delete db.metas[nombre]; }
        saveDatabase();
        res.json({ ok: true, categorias: db.categorias });
    } else res.status(404).json({ error: "Categoría no encontrada" });
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

// Dólar
app.post('/api/dolar', auth, requiereRol(['Admin', 'Dueño']), (req, res) => {
    const { valor } = req.body;
    db.dolarActual = Number(valor) || null;
    saveDatabase();
    res.json({ ok: true, dolar: db.dolarActual });
});
app.get('/api/dolar', auth, (_req, res) => res.json({ dolar: db.dolarActual }));

// ==================== PEDIDOS ====================
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

app.get('/api/pedidos', auth, (_req, res) => {
    const pedidos = db.pedidos.map(p => {
        const cliente = db.clientes.find(c => String(c.id) === String(p.cliente_id));
        const proveedor = db.proveedores.find(pr => String(pr.id) === String(p.cliente_id));
        return { ...p, cliente_nombre: cliente ? cliente.nombre : (proveedor ? proveedor.nombre : 'Desconocido'), es_proveedor: !!proveedor };
    });
    res.json(pedidos);
});

app.post('/api/pedidos', auth, requiereRol(['Admin', 'Dueño', 'Operador']), (req, res) => {
    const { cliente_id, serial_factura, serial, total, monto, tipo, tipo_doc, items, fecha, usuario, subtotal, iva, moneda, monto_original, dolar, es_proveedor } = req.body;
    const esProv = es_proveedor !== undefined ? es_proveedor : db.proveedores.some(p => String(p.id) === String(cliente_id));
    if (esProv && req.user.rol === 'Operador') return res.status(403).json({ error: 'Operador no puede crear pedidos a proveedores' });
    const cliente = esProv ? db.proveedores.find(p => String(p.id) === String(cliente_id)) : db.clientes.find(c => String(c.id) === String(cliente_id));
    if (!cliente) return res.status(400).json({ error: "Cuenta no encontrada" });

    const pedidoObj = {
        id: getNextId('pedidos'),
        cliente_id: cliente_id,
        serial_factura: serial_factura || serial || 'N/A',
        serial: serial_factura || serial || 'N/A',
        total: Number(total || monto) || 0,
        subtotal: Number(subtotal) || 0,
        iva: Number(iva) || 0,
        estado: tipo_doc === 'factura' || tipo === 'factura' ? 'completado' : 'pendiente',
        tipo: tipo_doc || tipo || 'pedido',
        items: items || [],
        fecha: fecha || fechaVenezuela(),
        creado_por: usuario || req.user.usuario,
        es_proveedor: esProv,
        nombre_cliente: cliente.nombre,
        moneda: moneda || null,
        monto_original: monto_original || null,
        dolar: dolar || null,
        contrapedido: false
    };

    if (!esProv) {
        (pedidoObj.items || []).forEach(item => {
            const disponible = stockDisponibleReal(item.prod_id);
            const cantCajas = Number(item.cant_cajas || 0);
            if (cantCajas > disponible) {
                pedidoObj.contrapedido = true;
                item.contrapedido = true;
                item.faltante = cantCajas - disponible;
            } else {
                item.contrapedido = false;
                item.faltante = 0;
            }
        });
    }

    if (pedidoObj.estado === 'completado') {
        if (!esProv) {
            for (const item of pedidoObj.items) {
                const disponible = stockDisponibleReal(item.prod_id);
                if (Number(item.cant_cajas || 0) > disponible) {
                    return res.status(400).json({ error: `Stock insuficiente para ${item.nombre}` });
                }
            }
            pedidoObj.items.forEach(item => {
                const prod = db.productos.find(p => p.id == item.prod_id);
                if (prod) {
                    prod.stock = Math.max(0, (Number(prod.stock) || 0) - Number(item.cant_cajas || 0));
                    prod.stock_cajas = prod.stock;
                    if (prod.usa_gabera && cliente) {
                        cliente.deuda_vacios = (Number(cliente.deuda_vacios || 0) || 0) + Number(item.cant_cajas || 0);
                        cliente.deuda_inicial_vacios = cliente.deuda_vacios;
                    }
                }
            });
        } else {
            pedidoObj.items.forEach(item => {
                const prod = db.productos.find(p => p.id == item.prod_id);
                if (prod) {
                    prod.stock = (Number(prod.stock) || 0) + Number(item.cant_cajas || 0);
                    prod.stock_cajas = prod.stock;
                }
            });
        }
        cliente.deuda_inicial_dinero = (Number(cliente.deuda_inicial_dinero) || 0) + pedidoObj.total;
        db.movimientos.push({
            id: getNextId('movimientos'),
            cliente_id: cliente_id,
            cuenta_id: cliente_id,
            tipo: esProv ? 'COMPRA_PROVEEDOR' : 'FACTURA',
            fecha: pedidoObj.fecha,
            detalle: esProv ? `Compra a ${cliente.nombre}` : 'Factura',
            monto: pedidoObj.total,
            subtotal: pedidoObj.subtotal,
            iva: pedidoObj.iva,
            items: pedidoObj.items,
            usuario: pedidoObj.creado_por,
            moneda: pedidoObj.moneda,
            monto_original: pedidoObj.monto_original,
            dolar: pedidoObj.dolar
        });
    }

    db.pedidos.push(pedidoObj);
    saveDatabase();
    res.json({ ok: true, id: pedidoObj.id, contrapedido: pedidoObj.contrapedido });
});

app.put('/api/pedidos/:id', auth, requiereRol(['Admin', 'Dueño', 'Operador']), (req, res) => {
    const { id } = req.params;
    const idx = db.pedidos.findIndex(p => p.id == id);
    if (idx === -1) return res.status(404).json({ error: "Pedido no encontrado" });
    const pedidoAnterior = db.pedidos[idx];

    if (req.body.cliente_id !== undefined && String(req.body.cliente_id) !== String(pedidoAnterior.cliente_id)) {
        return res.status(400).json({ error: "No se puede cambiar la cuenta" });
    }
    if (req.body.es_proveedor !== undefined && req.body.es_proveedor !== pedidoAnterior.es_proveedor) {
        return res.status(400).json({ error: "No se puede cambiar el tipo" });
    }
    if ((pedidoAnterior.estado === 'pendiente' || pedidoAnterior.estado === 'Pendiente') &&
        (req.body.estado === 'completado' || req.body.estado === 'factura' || req.body.tipo === 'factura')) {
        return res.status(400).json({ error: "Para facturar use el botón Despachar" });
    }

    db.pedidos[idx] = { ...db.pedidos[idx], ...req.body };

    const esProv = db.pedidos[idx].es_proveedor;
    if (!esProv && (db.pedidos[idx].estado === 'pendiente' || db.pedidos[idx].estado === 'Pendiente')) {
        db.pedidos[idx].contrapedido = false;
        (db.pedidos[idx].items || []).forEach(item => {
            const disponible = stockDisponibleReal(item.prod_id, id);
            const cantCajas = Number(item.cant_cajas || 0);
            if (cantCajas > disponible) {
                db.pedidos[idx].contrapedido = true;
                item.contrapedido = true;
                item.faltante = cantCajas - disponible;
            } else {
                item.contrapedido = false;
                item.faltante = 0;
            }
        });
    }
    saveDatabase();
    res.json({ ok: true });
});

app.post('/api/pedidos/:id/facturar', auth, requiereRol(['Admin', 'Dueño', 'Operador']), (req, res) => {
    const { id } = req.params;
    const pedido = db.pedidos.find(p => p.id == id);
    if (!pedido) return res.status(404).json({ error: "Pedido no encontrado" });
    if (pedido.estado !== 'pendiente' && pedido.estado !== 'Pendiente') {
        return res.status(400).json({ error: "El pedido ya fue facturado" });
    }
    const esProv = pedido.es_proveedor;
    const cliente = esProv ? db.proveedores.find(p => String(p.id) === String(pedido.cliente_id)) : db.clientes.find(c => String(c.id) === String(pedido.cliente_id));
    if (!cliente) return res.status(404).json({ error: "Cuenta no encontrada" });

    if (!esProv) {
        for (const item of pedido.items) {
            const disponible = stockDisponibleReal(item.prod_id, pedido.id);
            if (Number(item.cant_cajas || 0) > disponible) {
                return res.status(400).json({ error: `Stock insuficiente para ${item.nombre}` });
            }
        }
    }

    pedido.estado = 'completado';
    pedido.tipo = 'factura';
    cliente.deuda_inicial_dinero = (Number(cliente.deuda_inicial_dinero) || 0) + Number(pedido.total || 0);

    (pedido.items || []).forEach(item => {
        const prod = db.productos.find(p => p.id == item.prod_id);
        if (prod) {
            if (esProv) {
                prod.stock = (Number(prod.stock) || 0) + Number(item.cant_cajas || 0);
                prod.stock_cajas = prod.stock;
            } else {
                prod.stock = Math.max(0, (Number(prod.stock) || 0) - Number(item.cant_cajas || 0));
                prod.stock_cajas = prod.stock;
                if (prod.usa_gabera && cliente) {
                    cliente.deuda_vacios = (Number(cliente.deuda_vacios || 0) || 0) + Number(item.cant_cajas || 0);
                    cliente.deuda_inicial_vacios = cliente.deuda_vacios;
                }
            }
        }
    });

    db.movimientos.push({
        id: getNextId('movimientos'),
        cliente_id: pedido.cliente_id,
        cuenta_id: pedido.cliente_id,
        tipo: esProv ? 'COMPRA_PROVEEDOR' : 'FACTURA',
        fecha: fechaVenezuela(),
        detalle: esProv ? `Compra a ${cliente.nombre}` : 'Factura',
        monto: Number(pedido.total || 0),
        subtotal: pedido.subtotal,
        iva: pedido.iva,
        items: pedido.items,
        usuario: pedido.creado_por || req.user.usuario,
        moneda: pedido.moneda,
        monto_original: pedido.monto_original,
        dolar: pedido.dolar
    });

    if (!esProv) {
        (pedido.items || []).forEach(item => {
            const prod = db.productos.find(p => p.id == item.prod_id);
            if (prod && prod.usa_gabera && cliente) {
                db.movimientos.push({
                    id: getNextId('movimientos'),
                    cliente_id: pedido.cliente_id,
                    cuenta_id: pedido.cliente_id,
                    prod_id: prod.id,
                    tipo: 'SUMA_VACIOS',
                    fecha: fechaVenezuela(),
                    detalle: `Suma de vacíos: ${item.nombre}`,
                    monto: Number(item.cant_cajas || 0),
                    saldo_vacios: cliente.deuda_vacios,
                    usuario: pedido.creado_por || req.user.usuario
                });
            }
        });
    }
    saveDatabase();
    res.json({ ok: true });
});

app.delete('/api/pedidos/:id', auth, requiereRol(['Admin', 'Dueño', 'Operador']), (req, res) => {
    const { id } = req.params;
    const pedido = db.pedidos.find(p => p.id == id);
    if (!pedido) return res.status(404).json({ error: "Pedido no encontrado" });
    if (pedido.estado !== 'pendiente' && pedido.estado !== 'Pendiente') {
        return res.status(400).json({ error: "Solo se pueden eliminar pedidos pendientes" });
    }
    db.pedidos = db.pedidos.filter(p => p.id != id);
    saveDatabase();
    res.json({ ok: true });
});

// Movimientos
app.post('/api/movimientos', auth, requiereRol(['Admin', 'Dueño', 'Operador']), (req, res) => {
    const { cliente_id, prod_id, tipo, detalle, monto, saldo_vacios, fecha, usuario, moneda, monto_original, dolar } = req.body;
    const movObj = {
        id: getNextId('movimientos'),
        cliente_id: cliente_id,
        cuenta_id: cliente_id,
        prod_id: prod_id || null,
        tipo: tipo || 'RETIRO_VACIOS',
        fecha: fecha || fechaVenezuela(),
        detalle: detalle || 'Retiro de vacíos',
        monto: Number(monto) || 0,
        saldo_vacios: saldo_vacios !== undefined ? saldo_vacios : null,
        usuario: usuario || req.user.usuario,
        moneda: moneda || null,
        monto_original: monto_original || null,
        dolar: dolar || null
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

app.get('/api/movimientos', auth, requiereRol(['Admin', 'Dueño']), (_req, res) => res.json(db.movimientos));

app.delete('/api/movimientos/:id', auth, requiereRol(['Admin']), (req, res) => {
    const { id } = req.params;
    const mov = db.movimientos.find(m => m.id == id);
    if (mov && (mov.tipo || '').includes('RETIRO')) {
        const cliente = db.clientes.find(c => String(c.id) === String(mov.cliente_id));
        if (cliente) {
            cliente.deuda_vacios = (Number(cliente.deuda_vacios || 0) || 0) + Number(mov.monto || 0);
            cliente.deuda_inicial_vacios = cliente.deuda_vacios;
        }
    }
    db.movimientos = db.movimientos.filter(m => m.id != id);
    saveDatabase();
    res.json({ ok: true });
});

// Pagos
app.post('/api/pagos', auth, requiereRol(['Admin', 'Dueño', 'Operador']), (req, res) => {
    const { tipo_transaccion, cliente_id, cuenta_id, monto, referencia, ref, fecha, usuario, moneda, monto_original, dolar } = req.body;
    const targetCuentaId = cuenta_id !== undefined && cuenta_id !== '' ? cuenta_id : cliente_id;
    const targetMonto = Number(monto) || 0;
    const esProv = db.proveedores.some(p => String(p.id) === String(targetCuentaId));
    if (esProv && req.user.rol === 'Operador') return res.status(403).json({ error: 'Operador no puede pagar a proveedores' });
    const cliente = esProv ? db.proveedores.find(p => String(p.id) === String(targetCuentaId)) : db.clientes.find(c => String(c.id) === String(targetCuentaId));
    if (!cliente) return res.status(404).json({ error: "Cuenta no encontrada" });
    const deudaAnterior = Number(cliente.deuda_inicial_dinero) || 0;
    if (targetMonto > deudaAnterior) return res.status(400).json({ error: "El monto supera la deuda pendiente" });
    cliente.deuda_inicial_dinero = Math.max(0, deudaAnterior - targetMonto);
    db.movimientos.push({
        id: getNextId('movimientos'),
        cliente_id: targetCuentaId,
        cuenta_id: targetCuentaId,
        tipo: tipo_transaccion || (esProv ? 'PAGO_PROVEEDOR' : 'PAGO_RECIBIDO'),
        fecha: fecha || fechaVenezuela(),
        detalle: esProv ? `Pago a ${cliente.nombre}` : 'Pago / Abono de Cliente',
        monto: targetMonto,
        referencia: ref || referencia || '',
        deuda_anterior: deudaAnterior,
        deuda_restante: cliente.deuda_inicial_dinero,
        usuario: usuario || req.user.usuario,
        moneda: moneda || null,
        monto_original: monto_original || null,
        dolar: dolar || null
    });
    saveDatabase();
    res.json({ ok: true });
});

// Gastos
app.post('/api/gastos', auth, requiereRol(['Admin', 'Dueño']), (req, res) => {
    const { monto, descripcion, referencia, tipo, trabajador_id, trabajador_nombre, fecha, usuario } = req.body;
    const gastoObj = {
        id: getNextId('gastos'),
        monto: Number(monto) || 0,
        descripcion: descripcion || 'Gasto',
        referencia: referencia || '',
        tipo: tipo || 'general',
        trabajador_id: trabajador_id || null,
        trabajador_nombre: trabajador_nombre || '',
        fecha: fecha || fechaVenezuela(),
        usuario: usuario || req.user.usuario
    };
    db.gastos.push(gastoObj);
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

// Trabajadores
app.get('/api/trabajadores', auth, requiereRol(['Admin', 'Dueño']), (_req, res) => res.json(db.trabajadores || []));
app.post('/api/trabajadores', auth, requiereRol(['Admin', 'Dueño']), (req, res) => {
    const { id, nombre, labor, telefono } = req.body;
    if (id) {
        const idx = db.trabajadores.findIndex(t => t.id == id);
        if (idx !== -1) db.trabajadores[idx] = { ...db.trabajadores[idx], nombre, labor, telefono };
    } else {
        db.trabajadores.push({ id: getNextId('trabajadores'), nombre: nombre || 'Trabajador', labor: labor || 'General', telefono: telefono || '' });
    }
    saveDatabase();
    res.json({ ok: true });
});
app.delete('/api/trabajadores/:id', auth, requiereRol(['Admin']), (req, res) => {
    const { id } = req.params;
    db.trabajadores = (db.trabajadores || []).filter(t => t.id != id);
    saveDatabase();
    res.json({ ok: true });
});

// Metas
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

// Exportación e importación
app.get('/api/exportar', auth, requiereRol(['Admin', 'Dueño']), (_req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 'attachment; filename=sog_database.json');
    res.send(JSON.stringify(db, null, 2));
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
        if (!Array.isArray(datos.clientes) || !Array.isArray(datos.productos) || !Array.isArray(datos.pedidos)) {
            return res.status(400).json({ error: 'El JSON no tiene la estructura correcta' });
        }
        for (const c of datos.clientes) if (!c.id || !c.nombre) return res.status(400).json({ error: 'Cliente sin id o nombre' });
        for (const p of datos.productos) if (!p.id || !p.nombre) return res.status(400).json({ error: 'Producto sin id o nombre' });
        for (const ped of datos.pedidos) {
            if (!ped.id) return res.status(400).json({ error: 'Pedido sin id' });
            if (!Array.isArray(ped.items)) return res.status(400).json({ error: 'Pedido sin items' });
            for (const item of ped.items) {
                if (!item.prod_id) return res.status(400).json({ error: 'Item de pedido sin prod_id' });
                if (item.cant_cajas === undefined && item.cantidad === undefined) return res.status(400).json({ error: 'Item de pedido sin cantidad' });
            }
        }
        hacerBackup();
        db = datos;
        if (!db.metas) db.metas = {};
        if (!db.nextId) db.nextId = defaultDB.nextId;
        if (!db.gastos) db.gastos = [];
        if (!db.trabajadores) db.trabajadores = [];
        if (!db.categorias) db.categorias = ['General'];
        saveDatabase();
        res.json({ ok: true, mensaje: 'Base de datos importada correctamente' });
    } catch (e) {
        res.status(500).json({ error: 'Error al importar: ' + e.message });
    }
});

app.post('/api/limpiar', auth, requiereRol(['Admin']), (req, res) => {
    try { hacerBackup(); db = JSON.parse(JSON.stringify(defaultDB)); saveDatabase(); res.json({ ok: true }); }
    catch (e) { res.status(500).json({ error: e.message }); }
});

// Cierre diario
app.post('/api/cierre', auth, requiereRol(['Admin', 'Dueño']), (req, res) => {
    if (db.cierreBloqueado) return res.status(400).json({ error: "El cierre ya fue realizado hoy" });
    const hoy = fechaVenezuela().split('T')[0];
    const movimientosHoy = db.movimientos.filter(m => (m.fecha || '').split('T')[0] === hoy);
    const gastosHoy = (db.gastos || []).filter(g => (g.fecha || '').split('T')[0] === hoy);
    const pagosRecibidos = movimientosHoy.filter(m => (m.tipo || '').includes('PAGO_RECIBIDO'));
    const pagosProveedor = movimientosHoy.filter(m => (m.tipo || '').includes('PAGO_PROVEEDOR') || (m.tipo || '').includes('PAGO_POLAR'));
    const totalGastos = gastosHoy.reduce((s, g) => s + Number(g.monto || 0), 0);
    const totalCobros = pagosRecibidos.reduce((s, m) => s + Number(m.monto || 0), 0);
    const totalPagosProveedor = pagosProveedor.reduce((s, m) => s + Number(m.monto || 0), 0);
    const gananciaNeta = totalCobros - totalPagosProveedor - totalGastos;
    const cierreObj = {
        fecha: hoy,
        total_ventas: movimientosHoy.filter(m => (m.tipo || '').includes('FACTURA')).reduce((s, m) => s + Number(m.monto || 0), 0),
        total_cobros: totalCobros,
        total_pagos_proveedor: totalPagosProveedor,
        total_gastos: totalGastos,
        ganancia_neta: gananciaNeta,
        total_movimientos: movimientosHoy.length,
        dolar_dia: db.dolarActual,
        cerrado_por: req.user.usuario,
        cerrado_a: fechaVenezuela()
    };
    const cierreFile = path.join(CIERRES_DIR, `cierre_${hoy}.json`);
    fs.writeFileSync(cierreFile, JSON.stringify(cierreObj, null, 2), 'utf8');
    db.cierres = db.cierres || [];
    db.cierres.push(cierreObj);
    db.ultimoCierre = cierreObj;
    db.cierreBloqueado = true;
    db.gastos = (db.gastos || []).filter(g => (g.fecha || '').split('T')[0] !== hoy);
    db.pedidos = db.pedidos.filter(p => {
        if (p.estado === 'pendiente' || p.estado === 'Pendiente') return true;
        return (p.fecha || '').split('T')[0] !== hoy;
    });
    hacerBackup();
    saveDatabase();
    res.json({ ok: true, cierre: cierreObj });
});

app.post('/api/cierre/desbloquear', auth, requiereRol(['Admin']), (req, res) => {
    db.cierreBloqueado = false;
    saveDatabase();
    res.json({ ok: true });
});

app.post('/api/cierre/borrar-ultimo', auth, requiereRol(['Admin']), (req, res) => {
    if (db.cierres && db.cierres.length > 0) {
        db.cierres.pop();
        db.cierreBloqueado = false;
        saveDatabase();
        res.json({ ok: true });
    } else res.status(404).json({ error: "No hay cierres para borrar" });
});

app.get('/api/cierres', auth, requiereRol(['Admin', 'Dueño']), (_req, res) => res.json(db.cierres || []));

app.listen(PORT, () => {
    console.log(`Servidor ejecutándose en el puerto ${PORT}`);
    console.log(`Base de datos: ${DB_FILE}`);
});
