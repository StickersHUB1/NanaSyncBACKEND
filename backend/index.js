const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const { MongoClient } = require('mongodb');
const bcrypt = require('bcrypt');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 10000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://...';

// ✅ CORS FIJO (GitHub + local)
const ALLOWED_ORIGINS = ['https://stickershub1.github.io', 'http://localhost:8080'];

app.use(cors({
  origin: function (origin, callback) {
    if (!origin || ALLOWED_ORIGINS.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Bloqueado por CORS'));
    }
  },
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type']
}));

app.options('*', cors()); // 🔧 permite preflight

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

// === ENDPOINT: Registrar empresa ===
app.post('/api/empresas', async (req, res) => {
  console.log('📥 POST /api/empresas');

  if (!db) return res.status(500).json({ error: 'DB no disponible' });

  const { nombre, email, password } = req.body;
  if (!nombre || !email || !password) {
    return res.status(400).json({ error: 'Faltan datos' });
  }

  const empresas = db.collection('empresas');
  const existente = await empresas.findOne({ email });
  if (existente) {
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
  console.log(`✅ Empresa registrada: ${email}`);
  res.status(201).json({ mensaje: 'Empresa registrada correctamente' });
});

// === ENDPOINT: Añadir empleado ===
app.post('/api/empleados', async (req, res) => {
  console.log('📥 POST /api/empleados');

  if (!db) return res.status(500).json({ error: 'DB no disponible' });

  const {
    empresaId, nombre, edad, puesto, rango,
    horario = {}, rol = "empleado"
  } = req.body;

  if (!empresaId || !nombre || !edad || !puesto || !rango || !horario.entrada || !horario.salida) {
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
  console.log(`✅ Empleado añadido: ${nombre}`);
  res.status(201).json({ mensaje: 'Empleado creado', empleado: nuevoEmpleado });
});

// === ENDPOINT: Ver empleados ===
app.get('/api/empleados', async (req, res) => {
  console.log('📥 GET /api/empleados');

  if (!db) return res.status(500).json({ error: 'DB no disponible' });
  const lista = await db.collection('empleados').find().toArray();
  res.json(lista);
});

// === ENDPOINT: Registrar fichaje ===
app.post('/api/fichajes', async (req, res) => {
  console.log('📥 POST /api/fichajes');

  if (!db) return res.status(500).json({ error: 'DB no disponible' });

  const { empleadoId, empresaId, tipo, estadoAsignado } = req.body;
  if (!empleadoId || !empresaId || !tipo || !estadoAsignado) {
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
  console.log(`✅ Fichaje registrado para ID: ${empleadoId}`);
  res.status(201).json({ mensaje: 'Fichaje registrado', fichaje });
});

startServer();
