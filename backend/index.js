const express = require("express");
const app = express();
const cors = require("cors");
const bodyParser = require("body-parser");
const bcrypt = require("bcrypt");
const { MongoClient, ObjectId } = require("mongodb");
require("dotenv").config();

app.use(cors());
app.use(bodyParser.json());

const uri = process.env.MONGODB_URI;
const client = new MongoClient(uri);
let db;

client.connect().then(() => {
  db = client.db();
  console.log("🟢 Conexión a MongoDB exitosa");

  const port = process.env.PORT || 10000;
  app.listen(port, () => {
    console.log(`🟢 NanaSync API corriendo en puerto ${port}`);
  });
});

// === ENDPOINT DE LOGS DESDE EL FRONTEND ===
app.post("/api/log", (req, res) => {
  const { level, message, context } = req.body;
  const logMsg = `[FRONTEND LOG] [${level.toUpperCase()}] ${message} ${context ? JSON.stringify(context) : ""}`;
  if (level === "error") {
    console.error(logMsg);
  } else if (level === "warn") {
    console.warn(logMsg);
  } else {
    console.log(logMsg);
  }
  res.json({ status: "ok" });
});

// === ENDPOINTS PRINCIPALES ===

// Registro de empresa
app.post("/api/empresas", async (req, res) => {
  const { nombre, email, password } = req.body;
  if (!nombre || !email || !password) {
    return res.status(400).json({ error: "Todos los campos son obligatorios" });
  }
  try {
    const existente = await db.collection("empresas").findOne({ email });
    if (existente) {
      return res.status(400).json({ error: "El email ya está registrado" });
    }
    const hash = await bcrypt.hash(password, 10);
    const resultado = await db.collection("empresas").insertOne({ nombre, email, password: hash });
    res.json({ _id: resultado.insertedId, nombre, email });
  } catch (err) {
    console.error("Error registrando empresa:", err);
    res.status(500).json({ error: "Error interno del servidor" });
  }
});

// Login de empresa
app.post("/api/login-empresa", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: "Email y contraseña requeridos" });
  }

  try {
    const empresa = await db.collection("empresas").findOne({ email });
    if (!empresa) {
      return res.status(401).json({ error: "Credenciales inválidas" });
    }

    const passwordCorrecta = await bcrypt.compare(password, empresa.password);
    if (!passwordCorrecta) {
      return res.status(401).json({ error: "Credenciales inválidas" });
    }

    res.json({
      _id: empresa._id,
      nombre: empresa.nombre,
      email: empresa.email
    });
  } catch (err) {
    console.error("Error al intentar loguear empresa:", err);
    res.status(500).json({ error: "Error en el servidor" });
  }
});

// Alta de empleados
app.post("/api/empleados", async (req, res) => {
  try {
    const datos = req.body;
    if (!datos.empresaId) {
      return res.status(400).json({ error: "Falta ID de la empresa" });
    }
    const resultado = await db.collection("empleados").insertOne(datos);
    res.json({ _id: resultado.insertedId });
  } catch (err) {
    console.error("Error registrando empleado:", err);
    res.status(500).json({ error: "Error interno del servidor" });
  }
});

// === helper: crear usuario y password por defecto ===
const slug = (s) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0,16);
const rand4 = () => Math.floor(1000 + Math.random()*9000);

// ⚠️ crea índice único para usuario de empleados (hazlo una vez al arranque)
client.connect().then(async () => {
  db = client.db();
  try {
    await db.collection("empleados").createIndex({ usuario: 1 }, { unique: true, sparse: true });
    console.log("🟢 Índice único empleados.usuario listo");
  } catch (e) { console.warn("Índice ya existía o falló crear índice", e.message); }
  const port = process.env.PORT || 10000;
  app.listen(port, () => console.log(`🟢 NanaSync API corriendo en puerto ${port}`));
});

// 3️⃣ Registro de empleado (actualizado: soporta usuario+password)
app.post("/api/empleados", async (req, res) => {
  const {
    nombre, edad, puesto, rango, horario,
    rol, estadoConexion, fichado, ultimoFichaje, empresaId,
    usuario, password
  } = req.body;

  if (!nombre || !edad || !puesto || !rango || !horario || !empresaId) {
    return res.status(400).json({ error: "Faltan campos obligatorios" });
  }

  let empresaObjectId;
  try { empresaObjectId = new ObjectId(empresaId); }
  catch { return res.status(400).json({ error: "empresaId no es un ObjectId válido" }); }

  try {
    const empresaExiste = await db.collection("empresas").findOne({ _id: empresaObjectId });
    if (!empresaExiste) return res.status(404).json({ error: "Empresa no encontrada" });

    // Generación de credenciales si no vienen
    const finalUsuario = usuario && usuario.trim() ? usuario.trim() : `${slug(nombre)}${rand4()}`;
    const plainPwd = password && password.trim() ? password.trim() : `Ns-${rand4()}${rand4()}`;
    const hashPwd  = await bcrypt.hash(plainPwd, 10);

    const doc = {
      nombre, edad, puesto, rango, horario,
      rol: rol || "empleado",
      estadoConexion: estadoConexion || "inactivo",
      fichado: typeof fichado === "boolean" ? fichado : false,
      ultimoFichaje: ultimoFichaje || null,
      empresaId: empresaObjectId,
      // credenciales
      usuario: finalUsuario,
      password: hashPwd
    };

    const resultado = await db.collection("empleados").insertOne(doc);

    // ⚠️ Devolvemos usuario y una password temporal SOLO en esta respuesta
    res.json({ _id: resultado.insertedId, usuario: finalUsuario, tempPassword: plainPwd, nombre });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ error: "Usuario ya existe, pruebe otro" });
    }
    console.error("Error registrando empleado:", err);
    res.status(500).json({ error: "Error interno del servidor" });
  }
});

// 4️⃣ Login de empleado
app.post("/api/login-empleado", async (req, res) => {
  const { usuario, password } = req.body;
  if (!usuario || !password) return res.status(400).json({ error: "Usuario y contraseña requeridos" });

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
      empresaId: emp.empresaId
    });
  } catch (e) {
    console.error("Error login empleado:", e);
    res.status(500).json({ error: "Error en el servidor" });
  }
});
