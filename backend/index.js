const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const { MongoClient } = require('mongodb');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://NanaSyncCEO:fgCXwIDCLLIxvFsb@nanasync.jfh0v8m.mongodb.net/nanasync?retryWrites=true&w=majority&appName=NanaSync&tls=true';

// Configurar CORS
app.use(cors({
  origin: ['https://stickershub1.github.io', 'http://localhost:8080']
}));
app.use(bodyParser.json());

// Conexión a MongoDB
let db;
async function connectDB() {
  try {
    const client = new MongoClient(MONGODB_URI, {
      serverSelectionTimeoutMS: 5000, // Tiempo de espera para selección de servidor
      tls: true // Forzar TLS explícitamente
    });
    await client.connect();
    db = client.db('nanasync');
    console.log('🟢 Conectado a MongoDB');
  } catch (err) {
    console.error('Error conectando a MongoDB:', err.message);
    throw err;
  }
}

async function startServer() {
  try {
    await connectDB();
    await initializeDB();
    app.listen(PORT, () => {
      console.log(`🟢 NanaSync API corriendo en puerto ${PORT}`);
    });
  } catch (err) {
    console.error('Error al iniciar el servidor:', err.message);
    process.exit(1);
  }
}

const empleadosDefault = [
  {
    id: '1001',
    password: 'nata123',
    nombre: 'Lidia González',
    puesto: 'Atención al Cliente',
    horario: '09:00 – 17:00',
    rol: 'empleado',
    estado: 'inactivo',
    vinculado: false
  },
  {
    id: 'admin01',
    password: 'admin123',
    nombre: 'Sandra Morales',
    puesto: 'Jefe de Operaciones',
    horario: '08:00 – 16:00',
    rol: 'admin',
    estado: 'inactivo',
    vinculado: false
  }
];

async function initializeDB() {
  if (!db) throw new Error('Base de datos no inicializada');
  const empleados = db.collection('empleados');
  const count = await empleados.countDocuments();
  if (count === 0) {
    await empleados.insertMany(empleadosDefault);
    console.log('Datos iniciales insertados en MongoDB');
  }
}

app.post('/api/login', async (req, res) => {
  if (!db) return res.status(500).json({ error: 'Error interno del servidor' });
  const { id, password } = req.body;
  if (!id || !password) return res.status(400).json({ error: 'Faltan credenciales' });

  const empleados = db.collection('empleados');
  const empleado = await empleados.findOne({ id, password });
  if (!empleado) return res.status(401).json({ error: 'Credenciales incorrectas' });

  await empleados.updateOne({ id }, { $set: { estado: 'activo' } });
  res.json(empleado);
});

app.post('/api/logout', async (req, res) => {
  if (!db) return res.status(500).json({ error: 'Error interno del servidor' });
  const { id } = req.body;
  const empleados = db.collection('empleados');
  const empleado = await empleados.findOne({ id });
  if (empleado) await empleados.updateOne({ id }, { $set: { estado: 'inactivo' } });
  res.json({ success: true });
});

app.post('/api/empleados', async (req, res) => {
  if (!db) return res.status(500).json({ error: 'Error interno del servidor' });
  const { nombre, puesto, horario } = req.body;
  if (!nombre || !puesto || !horario) return res.status(400).json({ error: 'Faltan datos del empleado' });

  const empleados = db.collection('empleados');
  const nuevo = {
    id: String(Date.now()),
    nombre, puesto, horario,
    rol: 'empleado', estado: 'inactivo', vinculado: false
  };
  await empleados.insertOne(nuevo);
  res.status(201).json(nuevo);
});

app.get('/api/empleados', async (req, res) => {
  if (!db) return res.status(500).json({ error: 'Error interno del servidor' });
  const empleados = db.collection('empleados');
  const lista = await empleados.find().toArray();
  res.json(lista);
});

app.post('/api/vincular', async (req, res) => {
  if (!db) return res.status(500).json({ error: 'Error interno del servidor' });
  const { idEmpleado, nombreDispositivo } = req.body;
  if (!idEmpleado || !nombreDispositivo) return res.status(400).json({ error: 'Faltan datos para vincular' });

  const empleados = db.collection('empleados');
  const emp = await empleados.findOne({ id: idEmpleado });
  if (!emp) return res.status(404).json({ error: 'Empleado no encontrado' });

  await empleados.updateOne({ id: idEmpleado }, { $set: { vinculado: true } });
  const dispositivos = db.collection('dispositivos');
  await dispositivos.insertOne({
    idEmpleado, nombreDispositivo, activo: true, timestamp: new Date().toISOString()
  });
  res.json({ success: true, mensaje: 'Dispositivo vinculado correctamente' });
});

app.get('/api/dispositivos', async (req, res) => {
  if (!db) return res.status(500).json({ error: 'Error interno del servidor' });
  const dispositivos = db.collection('dispositivos');
  const lista = await dispositivos.find().toArray();
  res.json(lista);
});

startServer().catch(err => console.error('Error al iniciar el servidor:', err.message));
