// backend/index.js

const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const { MongoClient, ObjectId } = require("mongodb");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 10000;
const MONGO_URI = process.env.MONGO_URI;

let db;

// Middleware CORS manual (para GitHub Pages)
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "https://stickershub1.github.io");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.sendStatus(200);
  next();
});

app.use(bodyParser.json());

// Conexión a MongoDB
MongoClient.connect(MONGO_URI)
  .then((client) => {
    db = client.db();
    console.log("🟢 Conexión a MongoDB exitosa");
    app.listen(PORT, () => {
      console.log(`🟢 NanaSync API corriendo en puerto ${PORT}`);
    });
  })
  .catch((err) => {
    console.error("❌ Error al conectar con MongoDB:", err);
  });

/* === ENDPOINTS === */

// Registro de empresa
app.post("/api/empresas", async (req, res) => {
  const { nombre, email, password } = req.body;
  console.log("📥 Solicitud de registro recibida:", req.body);

  if (!nombre || !email || !password) {
    return res.status(400).json({ error: "Faltan campos obligatorios." });
  }

  try {
    const empresaExistente = await db.collection("empresas").findOne({ email });
    if (empresaExistente) {
      return res.status(409).json({ error: "La empresa ya está registrada." });
    }

    const nuevaEmpresa = {
      nombre,
      email,
      password, // ⚠️ En producción: aplicar hash con bcrypt
      creadoEn: new Date().toISOString()
    };

    const resultado = await db.collection("empresas").insertOne(nuevaEmpresa);
    res.status(201).json({ mensaje: "Empresa registrada con éxito", id: resultado.insertedId });
  } catch (err) {
    console.error("❌ Error en /api/empresas:", err);
    res.status(500).json({ error: "Error interno del servidor" });
  }
});

// Crear empleado
app.post("/api/empleados", async (req, res) => {
  const datos = req.body;
  console.log("📥 Alta de nuevo empleado:", datos);

  if (!datos || !datos.empresaId || !datos.nombre) {
    return res.status(400).json({ error: "Datos incompletos." });
  }

  try {
    const resultado = await db.collection("empleados").insertOne({
      ...datos,
      creadoEn: new Date().toISOString()
    });

    res.status(201).json({ mensaje: "Empleado añadido", id: resultado.insertedId });
  } catch (err) {
    console.error("❌ Error en /api/empleados:", err);
    res.status(500).json({ error: "Error interno del servidor" });
  }
});
