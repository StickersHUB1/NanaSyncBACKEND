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
