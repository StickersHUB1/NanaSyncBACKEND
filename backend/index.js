// ✅ backend/index.js (código completo con /api/empleados)
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

client.connect()
  .then(() => {
    db = client.db();
    console.log("🟢 Conexión a MongoDB exitosa");

    const port = process.env.PORT || 10000;
    app.listen(port, () => {
      console.log(`🟢 NanaSync API corriendo en puerto ${port}`);
    });
  })
  .catch((err) => {
    console.error("🔴 Error conectando a MongoDB:", err);
    process.exit(1);
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

// Registro de empleado
app.post("/api/empleados", async (req, res) => {
  const {
    nombre, edad, puesto, rango, horario,
    rol, estadoConexion, fichado, ultimoFichaje, empresaId
  } = req.body;

  // Validación básica
  if (!nombre || !edad || !puesto || !rango || !horario || !empresaId) {
    return res.status(400).json({ error: "Faltan campos obligatorios" });
  }

  let empresaObjectId;
  try {
    empresaObjectId = new ObjectId(empresaId);
  } catch {
    return res.status(400).json({ error: "empresaId no es un ObjectId válido" });
  }

  try {
    // Verifica que la empresa existe
    const empresaExiste = await db.collection("empresas").findOne({ _id: empresaObjectId });
    if (!empresaExiste) {
      return res.status(404).json({ error: "Empresa no encontrada" });
    }

    // Inserta el empleado
    const resultado = await db.collection("empleados").insertOne({
      nombre,
      edad,
      puesto,
      rango,
      horario, // { entrada, salida }
      rol: rol || "empleado",
      estadoConexion: estadoConexion || "inactivo",
      fichado: typeof fichado === "boolean" ? fichado : false,
      ultimoFichaje: ultimoFichaje || null,
      empresaId: empresaObjectId
    });

    res.json({ _id: resultado.insertedId, nombre });
  } catch (err) {
    console.error("Error registrando empleado:", err);
    res.status(500).json({ error: "Error interno del servidor" });
  }
});
