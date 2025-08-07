const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const { MongoClient } = require('mongodb');
const bcrypt = require('bcrypt');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 10000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://...';

app.use(cors({
  origin: ['https://stickershub1.github.io', 'http://localhost:8080'],
  methods: ['GET', 'POST'],
  credentials: true
}));
app.use(bodyParser.json());

let db;
async function connectDB() {
  try {
    const client = new MongoClient(MONGODB_URI, {
      serverSelectionTimeoutMS: 5000,
      tls: true
    });
    await client.connect();
    db = client.db('NanaSync');
    console.log('🟢 Conexión a MongoDB exitosa');
  } catch (err) {
    console.error('❌ Error conectando a MongoDB:', err.message, err.stack);
    throw err;
  }
}

async function startServer() {
  try {
    await connectDB();
    app.listen(PORT, () => {
      console.log(`🟢 NanaSync API corriendo en puerto ${PORT}`);
    });
  } catch (err) {
    console.error('❌ Error al iniciar el servidor:', err.message);
    process.exit(1);
  }
}

// ==========================
// === ENDPOINTS API REST ===
// ==========================

// 🚀 REGISTRO DE EMPRESA
app.post('/api/empresas', async (req, res) => {
  console.log('📥 Registro empresa recibido:', req.body);

  if (!db) return res.status(500).json({ error: 'DB no disponible' });

  const { nombre, email, password } = req.body;
  if (!nombre || !email || !password) {
    console.warn('⚠️ Faltan datos para registro de empresa');
    return res.status(400).json({ error: 'Faltan datos' });
  }

  const empresas = db.collection('empresas');
  const existente = await empresas.findOne({ email });
  if (existente) {
    console.warn('🚫 Empresa ya registrada:', email);
    return res.status(409).json({ error: 'Empresa ya registrada' });
  }

  const hashedPassword = await bcrypt.hash(password, 12);

  const nuevaEmpresa = {
    nombre,
    email,
    password: hashedPassword,
    fechaRegistro: new Date()
  };

  await empresas.insertOne(nuevaEmpresa);
  console.log('✅ Empresa registrada con éxito:', nombre);
  res.status(201).json({ mensaje: 'Empresa registrada correctamente' });
});

// ➕ AÑADIR EMPLEADO
app.post('/api/empleados', async (req, res) => {
  console.log('📥 Añadir empleado recibido:', req.body);

  if (!db) return res.status(500).json({ error: 'DB no disponible' });

  const {
    empresaId, nombre, edad, puesto, rango,
    horario = {}, rol = "empleado"
  } = req.body;

  if (!empresaId || !nombre || !edad || !puesto || !rango || !horario.entrada || !horario.salida) {
    console.warn('⚠️ Faltan datos del empleado');
    return res.status(400).json({ error: 'Faltan datos del empleado' });
  }

  const nuevoEmpleado = {
    empresaId,
    nombre,
    edad,
    puesto,
    rango,
    horario,
    rol,
    estadoConexion: "inactivo",
    fichado: false,
    ultimoFichaje: new Date()
  };

  await db.collection('empleados').insertOne(nuevoEmpleado);
  console.log('✅ Empleado añadido:', nombre);
  res.status(201).json({ mensaje: 'Empleado creado', empleado: nuevoEmpleado });
});

// 📄 LISTADO DE EMPLEADOS
app.get('/api/empleados', async (req, res) => {
  console.log('📤 Petición GET empleados');

  if (!db) return res.status(500).json({ error: 'DB no disponible' });

  const lista = await db.collection('empleados').find().toArray();
  res.json(lista);
});

// 🕐 REGISTRAR FICHAJE
app.post('/api/fichajes', async (req, res) => {
  console.log('📥 Fichaje recibido:', req.body);

  if (!db) return res.status(500).json({ error: 'DB no disponible' });

  const { empleadoId, empresaId, tipo, estadoAsignado } = req.body;
  if (!empleadoId || !empresaId || !tipo || !estadoAsignado) {
    console.warn('⚠️ Faltan datos del fichaje');
    return res.status(400).json({ error: 'Faltan datos del fichaje' });
  }

  const fichaje = {
    empleadoId,
    empresaId,
    tipo,
    timestamp: new Date(),
    estadoAsignado
  };

  await db.collection('fichajes').insertOne(fichaje);
  console.log('✅ Fichaje registrado:', empleadoId, tipo);
  res.status(201).json({ mensaje: 'Fichaje registrado', fichaje });
});

startServer();
