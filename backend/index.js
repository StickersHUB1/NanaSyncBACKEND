// ✅ backend/index.js (driver nativo MongoDB, CommonJS)

const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const bcrypt = require("bcrypt");
const { MongoClient, ObjectId } = require("mongodb");
require("dotenv").config();

const app = express();

// ── Middlewares
app.use(cors()); // si quieres, restringe origin a tu dominio de Pages
app.use(bodyParser.json());

// ── Conexión MongoDB
const uri = process.env.MONGODB_URI;
const client = new MongoClient(uri);
let db;

// helpers
const slug = (s) =>
  String(s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 16);
const rand4 = () => Math.floor(1000 + Math.random() * 9000);

// ── Arranque
client.connect().then(async () => {
  db = client.db();
  console.log("🟢 Conexión a MongoDB exitosa");

  // índice único para empleados.usuario
  try {
    await db.collection("empleados").createIndex(
      { usuario: 1 },
      { unique: true, sparse: true }
    );
    console.log("🟢 Índice único empleados.usuario listo");
  } catch (e) {
    console.warn("⚠️ No se pudo crear índice (quizá ya existe):", e.message);
  }

  const PORT = process.env.PORT || 10000;
  app.listen(PORT, () => {
    console.log(`🟢 NanaSync API corriendo en puerto ${PORT}`);
  });
});

// ─────────────────────────────────────────────────────────────
// 🔵 Endpoint de logs para Render (desde el frontend)
// ─────────────────────────────────────────────────────────────
app.post("/api/log", (req, res) => {
  const { level = "info", message = "", context } = req.body || {};
  const line = `[FRONTEND LOG] [${String(level).toUpperCase()}] ${message} ${
    context ? JSON.stringify(context) : ""
  }`;

  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);

  res.json({ status: "ok" });
});

// ─────────────────────────────────────────────────────────────
// 🟢 Registro de empresa
// ─────────────────────────────────────────────────────────────
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
    const doc = { nombre, email, password: hash };
    const resultado = await db.collection("empresas").insertOne(doc);

    res.json({ _id: resultado.insertedId, nombre, email });
  } catch (err) {
    console.error("Error registrando empresa:", err);
    res.status(500).json({ error: "Error interno del servidor" });
  }
});

// ─────────────────────────────────────────────────────────────
// 🔐 Login de empresa
// ─────────────────────────────────────────────────────────────
app.post("/api/login-empresa", async (req, res) => {
  const { email, password } = req.body || {};

  if (!email || !password) {
    return res.status(400).json({ error: "Email y contraseña requeridos" });
  }

  try {
    const empresa = await db.collection("empresas").findOne({ email });
    if (!empresa) {
      return res.status(401).json({ error: "Credenciales inválidas" });
    }

    const ok = await bcrypt.compare(password, empresa.password);
    if (!ok) {
      return res.status(401).json({ error: "Credenciales inválidas" });
    }

    res.json({
      _id: empresa._id,
      nombre: empresa.nombre,
      email: empresa.email,
    });
  } catch (err) {
    console.error("Error al intentar loguear empresa:", err);
    res.status(500).json({ error: "Error en el servidor" });
  }
});

// ─────────────────────────────────────────────────────────────
// 👤 Alta de empleado (genera credenciales si no se envían)
// ─────────────────────────────────────────────────────────────
app.post("/api/empleados", async (req, res) => {
  try {
    const {
      nombre,
      edad,
      puesto,
      rango,
      horario,
      rol,
      estadoConexion,
      fichado,
      ultimoFichaje,
      empresaId,
      usuario, // opcional
      password, // opcional
    } = req.body || {};

    if (!nombre || !edad || !puesto || !rango || !horario || !empresaId) {
      return res
        .status(400)
        .json({ error: "Faltan campos obligatorios del empleado" });
    }

    let empresaObjectId;
    try {
      empresaObjectId = new ObjectId(empresaId);
    } catch {
      return res
        .status(400)
        .json({ error: "empresaId no es un ObjectId válido" });
    }

    const empresaExiste = await db
      .collection("empresas")
      .findOne({ _id: empresaObjectId });
    if (!empresaExiste) {
      return res.status(404).json({ error: "Empresa no encontrada" });
    }

    // generar credenciales si no vienen
    const finalUsuario =
      (usuario && String(usuario).trim()) || `${slug(nombre)}${rand4()}`;
    const plainPwd =
      (password && String(password)) || `Ns-${rand4()}${rand4()}`;
    const hashPwd = await bcrypt.hash(plainPwd, 10);

    const doc = {
      nombre,
      edad,
      puesto,
      rango,
      horario, // { entrada, salida }
      rol: rol || "empleado",
      estadoConexion: estadoConexion || "inactivo",
      fichado: typeof fichado === "boolean" ? fichado : false,
      ultimoFichaje: ultimoFichaje || null,
      empresaId: empresaObjectId,
      usuario: finalUsuario,
      password: hashPwd,
    };

    const resultado = await db.collection("empleados").insertOne(doc);

    // devolvemos usuario y, SOLO si generamos password, la temporal
    const resp = { _id: resultado.insertedId, usuario: finalUsuario, nombre };
    if (!password) resp.tempPassword = plainPwd;

    res.json(resp);
  } catch (err) {
    if (err?.code === 11000) {
      return res.status(409).json({ error: "Usuario ya existe, pruebe otro" });
    }
    console.error("Error registrando empleado:", err);
    res.status(500).json({ error: "Error interno del servidor" });
  }
});

// ─────────────────────────────────────────────────────────────
// 🔐 Login de empleado
// ─────────────────────────────────────────────────────────────
app.post("/api/login-empleado", async (req, res) => {
  const { usuario, password } = req.body || {};
  if (!usuario || !password) {
    return res
      .status(400)
      .json({ error: "Usuario y contraseña requeridos" });
  }

  try {
    const emp = await db.collection("empleados").findOne({ usuario });
    if (!emp) return res.status(401).json({ error: "Credenciales inválidas" });

    const ok = await bcrypt.compare(password, emp.password);
    if (!ok) return res.status(401).json({ error: "Credenciales inválidas" });

    // perfil básico
    res.json({
      _id: emp._id,
      usuario: emp.usuario,
      nombre: emp.nombre,
      puesto: emp.puesto,
      rango: emp.rango,
      horario: emp.horario,
      empresaId: emp.empresaId,
    });
  } catch (e) {
    console.error("Error login empleado:", e);
    res.status(500).json({ error: "Error en el servidor" });
  }
});
