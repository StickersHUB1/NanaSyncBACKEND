// backend/index.js (COMPLETO)

const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const bcrypt = require("bcrypt");
const { MongoClient, ObjectId } = require("mongodb");
require("dotenv").config();

const app = express();

// --------- Config ---------
const PORT = process.env.PORT || 10000;
const MONGODB_URI = process.env.MONGODB_URI;
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map(s => s.trim())
  .filter(Boolean);

// Permite GitHub Pages y tu dominio de Render como mínimo
const defaultAllowed = [
  "https://stickershub1.github.io",
  "https://nanasyncbackend.onrender.com",
  "https://nanasync-backend.onrender.com"
];
const allowlist = [...new Set([...defaultAllowed, ...ALLOWED_ORIGINS])];

app.use(bodyParser.json());

// CORS afinado con preflight
app.use(
  cors({
    origin: function (origin, cb) {
      if (!origin) return cb(null, true); // curl / same-origin
      if (allowlist.includes(origin)) return cb(null, true);
      return cb(new Error("Not allowed by CORS"));
    },
    credentials: false,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"]
  })
);
app.options("*", cors());

// --------- Conexión Mongo ---------
const client = new MongoClient(MONGODB_URI);
let db;

async function init() {
  await client.connect();
  db = client.db();
  console.log("🟢 Conexión a MongoDB exitosa");

  // Índice único para empleados.usuario
  try {
    await db.collection("empleados").createIndex({ usuario: 1 }, { unique: true, sparse: true });
    console.log("🟢 Índice único empleados.usuario listo");
  } catch (e) {
    console.warn("⚠️ No se pudo crear índice empleados.usuario:", e.message);
  }

  app.listen(PORT, () => {
    console.log(`🟢 NanaSync API corriendo en puerto ${PORT}`);
  });
}
init().catch((e) => {
  console.error("❌ Error inicializando servidor:", e);
  process.exit(1);
});

// --------- Helpers ---------
const safeId = (id) => {
  try { return new ObjectId(id); } catch { return null; }
};

// --------- Logging desde el front (opcional) ---------
app.post("/api/log", (req, res) => {
  const { level = "info", message = "", context = null } = req.body || {};
  const tag = `[FRONTEND LOG] [${String(level).toUpperCase()}] ${message}`;
  try {
    if (level === "error") console.error(tag, context || "");
    else if (level === "warn") console.warn(tag, context || "");
    else console.log(tag, context || "");
  } catch {}
  res.json({ ok: true });
});

// =============================================
//               EMPRESAS
// =============================================

// Registro de empresa
app.post("/api/empresas", async (req, res) => {
  const { nombre, email, password } = req.body || {};
  if (!nombre || !email || !password) {
    return res.status(400).json({ error: "Todos los campos son obligatorios" });
  }
  try {
    const existente = await db.collection("empresas").findOne({ email });
    if (existente) {
      return res.status(400).json({ error: "El email ya está registrado" });
    }
    const hash = await bcrypt.hash(password, 10);
    const doc = {
      nombre,
      displayName: nombre,         // inicializa displayName
      email,
      password: hash,
      logoUrl: null,               // editable en ajustes
      createdAt: new Date()
    };
    const r = await db.collection("empresas").insertOne(doc);
    res.json({ _id: r.insertedId, nombre: doc.nombre, email: doc.email, displayName: doc.displayName, logoUrl: doc.logoUrl });
  } catch (err) {
    console.error("Error registrando empresa:", err);
    res.status(500).json({ error: "Error interno del servidor" });
  }
});

// Login de empresa
app.post("/api/login-empresa", async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: "Email y contraseña requeridos" });
  }
  try {
    const empresa = await db.collection("empresas").findOne({ email });
    if (!empresa) return res.status(401).json({ error: "Credenciales inválidas" });

    const ok = await bcrypt.compare(password, empresa.password);
    if (!ok) return res.status(401).json({ error: "Credenciales inválidas" });

    res.json({
      _id: empresa._id,
      nombre: empresa.nombre,
      displayName: empresa.displayName || empresa.nombre,
      email: empresa.email,
      logoUrl: empresa.logoUrl || null
    });
  } catch (err) {
    console.error("Error al intentar loguear empresa:", err);
    res.status(500).json({ error: "Error en el servidor" });
  }
});

// Obtener perfil de empresa (para pintar header)
app.get("/api/empresas/:id", async (req, res) => {
  const _id = safeId(req.params.id);
  if (!_id) return res.status(400).json({ error: "ID inválido" });
  try {
    const empresa = await db
      .collection("empresas")
      .findOne({ _id }, { projection: { password: 0 } });
    if (!empresa) return res.status(404).json({ error: "Empresa no encontrada" });
    res.json(empresa);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Error obteniendo empresa" });
  }
});

// Actualizar perfil (displayName, logoUrl)
app.put("/api/empresas/:id", async (req, res) => {
  const _id = safeId(req.params.id);
  if (!_id) return res.status(400).json({ error: "ID inválido" });

  const { displayName, logoUrl } = req.body || {};
  const set = {};
  if (typeof displayName === "string") set.displayName = displayName;
  if (typeof logoUrl === "string" || logoUrl === null) set.logoUrl = logoUrl || null;

  if (!Object.keys(set).length) return res.status(400).json({ error: "Nada para actualizar" });

  try {
    await db.collection("empresas").updateOne({ _id }, { $set: set });
    const empresa = await db.collection("empresas").findOne(
      { _id },
      { projection: { password: 0 } }
    );
    res.json(empresa);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Error actualizando empresa" });
  }
});

// =============================================
//               EMPLEADOS
// =============================================

// Alta de empleado (usuario/password opcionales; si no, se generan)
app.post("/api/empleados", async (req, res) => {
  const {
    nombre,
    edad,
    puesto,
    rango,
    horario = {},
    rol = "empleado",
    estadoConexion = "inactivo",
    fichado = false,
    ultimoFichaje = new Date().toISOString(),
    empresaId,
    usuario,
    password
  } = req.body || {};

  if (!empresaId || !nombre || !Number.isFinite(edad) || !puesto || !rango || !horario.entrada || !horario.salida) {
    return res.status(400).json({ error: "Campos obligatorios faltantes" });
  }

  const empresaObjectId = safeId(empresaId);
  if (!empresaObjectId) return res.status(400).json({ error: "empresaId inválido" });

  try {
    // Genera usuario si no llega
    let finalUsuario = usuario && String(usuario).trim();
    if (!finalUsuario) {
      // slug básico + random
      const base = (nombre || "user").toLowerCase().replace(/\s+/g, "");
      finalUsuario = `${base}${Math.floor(1000 + Math.random() * 9000)}`;
    }

    // Genera password si no llega
    let tempPassword = null;
    let passwordHash = null;
    if (!password) {
      tempPassword = Math.random().toString(36).slice(-10);
      passwordHash = await bcrypt.hash(tempPassword, 10);
    } else {
      passwordHash = await bcrypt.hash(password, 10);
    }

    const doc = {
      nombre,
      edad,
      puesto,
      rango,
      horario: { entrada: horario.entrada, salida: horario.salida },
      rol,
      estadoConexion,
      fichado,
      ultimoFichaje,
      empresaId: empresaObjectId,
      usuario: finalUsuario,
      password: passwordHash,
      createdAt: new Date()
    };

    const r = await db.collection("empleados").insertOne(doc);
    res.json({ _id: r.insertedId, usuario: finalUsuario, tempPassword });
  } catch (e) {
    console.error("Error creando empleado:", e);
    if (e?.code === 11000) {
      return res.status(409).json({ error: "El usuario ya existe" });
    }
    res.status(500).json({ error: "Error creando empleado" });
  }
});

// Listar empleados (por empresa, con q, paginación)
app.get("/api/empleados", async (req, res) => {
  const { empresaId, q = "", page = "1", limit = "50" } = req.query || {};
  const empresaObjectId = safeId(empresaId);
  if (!empresaObjectId) return res.status(400).json({ error: "empresaId inválido" });

  const pageNum = Math.max(parseInt(page, 10) || 1, 1);
  const lim = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200);

  const filter = { empresaId: empresaObjectId };
  if (q) {
    const rx = new RegExp(String(q).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    filter.$or = [{ nombre: rx }, { usuario: rx }, { puesto: rx }, { rango: rx }];
  }

  try {
    const total = await db.collection("empleados").countDocuments(filter);
    const items = await db
      .collection("empleados")
      .find(filter, { projection: { password: 0 } })
      .sort({ estadoConexion: -1, usuario: 1 })
      .skip((pageNum - 1) * lim)
      .limit(lim)
      .toArray();

    res.json({ total, page: pageNum, items });
  } catch (e) {
    console.error("Error listando empleados:", e);
    res.status(500).json({ error: "Error listando empleados" });
  }
});

// Login empleado
app.post("/api/login-empleado", async (req, res) => {
  const { usuario, password } = req.body || {};
  if (!usuario || !password) return res.status(400).json({ error: "Usuario y contraseña requeridos" });

  try {
    const emp = await db.collection("empleados").findOne({ usuario });
    if (!emp) return res.status(401).json({ error: "Credenciales inválidas" });

    const ok = await bcrypt.compare(password, emp.password);
    if (!ok) return res.status(401).json({ error: "Credenciales inválidas" });

    // Devuelve perfil sin hash
    const { password: _, ...safe } = emp;
    res.json(safe);
  } catch (e) {
    console.error("Error login empleado:", e);
    res.status(500).json({ error: "Error en el servidor" });
  }
});

// --------- Salud ---------
app.get("/", (_req, res) => {
  res.json({ ok: true, service: "NanaSync API" });
});
