const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const { MongoClient } = require('mongodb');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 10000; // Puerto fijo usado por Render
console.log('Iniciando servidor en puerto:', PORT);
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://NanaSyncCEO:fgCXwIDCLLIxvFsb@nanasync.jfh0v8m.mongodb.net/NanaSync?retryWrites=true&w=majority&appName=NanaSync&tls=true';

app.use(cors({
  origin: ['https://stickershub1.github.io', 'http://localhost:8080']
}));
console.log('CORS configurado para:', ['https://stickershub1.github.io', 'http://localhost:8080']);
app.use(bodyParser.json());
console.log('BodyParser configurado');

let db;
async function connectDB() {
  console.log('Intentando conectar a MongoDB con URI:', MONGODB_URI);
  try {
    const client = new MongoClient(MONGODB_URI, {
      serverSelectionTimeoutMS: 5000,
      tls: true
    });
    await client.connect();
    db = client.db('NanaSync');
    console.log('🟢 Conexión a MongoDB exitosa');
  } catch (err) {
    console.error('Error conectando a MongoDB:', err.message, err.stack);
    throw err;
  }
}

async function startServer() {
  console.log('Iniciando servidor...');
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
  { id: '1001', password: 'nata123', nombre: 'Lidia González', puesto: 'Atención al Cliente', horario: '09:00 – 17:00', rol: 'empleado', estado: 'inactivo', vinculado: false },
  { id: 'admin01', password: 'admin123', nombre: 'Sandra Morales', puesto: 'Jefe de Operaciones', horario: '08:00 – 16:00', rol: 'admin', estado: 'inactivo', vinculado: false }
];

async function initializeDB() {
  console.log('Inicializando base de datos...');
  if (!db) {
    console.error('Base de datos no inicializada');
    throw new Error('Base de datos no inicializada');
  }
  const empleados = db.collection('empleados');
  const count = await empleados.countDocuments();
  console.log('Número de empleados existentes:', count);
  if (count === 0) {
    await empleados.insertMany(empleadosDefault);
    console.log('Datos iniciales insertados en MongoDB:', empleadosDefault);
  } else {
    console.log('Datos iniciales ya existen, no se insertaron');
  }
}

app.post('/api/login', async (req, res) => {
  console.log('Recibida solicitud POST /api/login:', req.body);
  if (!db) {
    console.error('Base de datos no disponible');
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
  const { id, password } = req.body;
  if (!id || !password) {
    console.warn('Faltan credenciales en la solicitud');
    return res.status(400).json({ error: 'Faltan credenciales' });
  }

  const empleados = db.collection('empleados');
  const empleado = await empleados.findOne({ id, password });
  if (!empleado) {
    console.warn('Credenciales incorrectas para id:', id);
    return res.status(401).json({ error: 'Credenciales incorrectas' });
  }

  await empleados.updateOne({ id }, { $set: { estado: 'activo' } });
  console.log('Login exitoso para:', empleado.nombre);
  res.json(empleado);
});

app.post('/api/logout', async (req, res) => {
  console.log('Recibida solicitud POST /api/logout:', req.body);
  if (!db) {
    console.error('Base de datos no disponible');
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
  const { id } = req.body;
  const empleados = db.collection('empleados');
  const empleado = await empleados.findOne({ id });
  if (empleado) {
    await empleados.updateOne({ id }, { $set: { estado: 'inactivo' } });
    console.log('Logout exitoso para:', empleado.nombre);
  } else {
    console.warn('Empleado no encontrado para logout:', id);
  }
  res.json({ success: true });
});

app.post('/api/empleados', async (req, res) => {
  console.log('Recibida solicitud POST /api/empleados:', req.body);
  if (!db) {
    console.error('Base de datos no disponible');
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
  const { nombre, puesto, horario } = req.body;
  if (!nombre || !puesto || !horario) {
    console.warn('Faltan datos en la solicitud de empleado');
    return res.status(400).json({ error: 'Faltan datos del empleado' });
  }

  const empleados = db.collection('empleados');
  const nuevo = {
    id: String(Date.now()),
    nombre, puesto, horario,
    rol: 'empleado', estado: 'inactivo', vinculado: false
  };
  await empleados.insertOne(nuevo);
  console.log('Nuevo empleado creado:', nuevo);
  res.status(201).json(nuevo);
});

app.get('/api/empleados', async (req, res) => {
  console.log('Recibida solicitud GET /api/empleados');
  if (!db) {
    console.error('Base de datos no disponible');
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
  const empleados = db.collection('empleados');
  const lista = await empleados.find().toArray();
  console.log('Empleados enviados:', lista.length);
  res.json(lista);
});

app.post('/api/vincular', async (req, res) => {
  console.log('Recibida solicitud POST /api/vincular:', req.body);
  if (!db) {
    console.error('Base de datos no disponible');
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
  const { idEmpleado, nombreDispositivo } = req.body;
  if (!idEmpleado || !nombreDispositivo) {
    console.warn('Faltan datos en la solicitud de vinculación');
    return res.status(400).json({ error: 'Faltan datos para vincular' });
  }

  const empleados = db.collection('empleados');
  const emp = await empleados.findOne({ id: idEmpleado });
  if (!emp) {
    console.warn('Empleado no encontrado:', idEmpleado);
    return res.status(404).json({ error: 'Empleado no encontrado' });
  }

  await empleados.updateOne({ id: idEmpleado }, { $set: { vinculado: true } });
  const dispositivos = db.collection('dispositivos');
  await dispositivos.insertOne({
    idEmpleado, nombreDispositivo, activo: true, timestamp: new Date().toISOString()
  });
  console.log('Vinculación exitosa para:', idEmpleado);
  res.json({ success: true, mensaje: 'Dispositivo vinculado correctamente' });
});

app.get('/api/dispositivos', async (req, res) => {
  console.log('Recibida solicitud GET /api/dispositivos');
  if (!db) {
    console.error('Base de datos no disponible');
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
  const dispositivos = db.collection('dispositivos');
  const lista = await dispositivos.find().toArray();
  console.log('Dispositivos enviados:', lista.length);
  res.json(lista);
});

startServer().catch(err => console.error('Error fatal al iniciar el servidor:', err.message));
