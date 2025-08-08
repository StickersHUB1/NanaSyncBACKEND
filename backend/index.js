// index.js
import express from "express";
import cors from "cors";
import mongoose from "mongoose";
import dotenv from "dotenv";
import bcrypt from "bcryptjs";
import Empresa from "./models/Empresa.js";
import Empleado from "./models/Empleado.js";

dotenv.config();
const app = express();

app.use(express.json());
app.use(cors({
  origin: "*", // En producción puedes restringirlo a tu dominio
  methods: ["GET", "POST", "PUT", "DELETE"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));

// 📌 Conexión a MongoDB
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => console.log("🟢 Conexión a MongoDB exitosa"))
.catch(err => console.error("🔴 Error conectando a MongoDB:", err));

// 📌 Registro de empresas
app.post("/api/empresas", async (req, res) => {
  try {
    const { nombre, email, password } = req.body;
    if (!nombre || !email || !password) {
      return res.status(400).json({ error: "Todos los campos son obligatorios" });
    }

    const existe = await Empresa.findOne({ email });
    if (existe) {
      return res.status(400).json({ error: "Ya existe una empresa con este email" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const nuevaEmpresa = new Empresa({ nombre, email, password: hashedPassword });
    await nuevaEmpresa.save();

    console.log(`✅ Empresa registrada: ${nuevaEmpresa.nombre}`);
    res.status(200).json(nuevaEmpresa);
  } catch (err) {
    console.error("Error registrando empresa:", err);
    res.status(500).json({ error: "Error interno del servidor" });
  }
});

// 📌 Login de empresas
app.post("/api/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const empresa = await Empresa.findOne({ email });
    if (!empresa) {
      return res.status(400).json({ error: "Credenciales inválidas" });
    }

    const passwordOK = await bcrypt.compare(password, empresa.password);
    if (!passwordOK) {
      return res.status(400).json({ error: "Credenciales inválidas" });
    }

    console.log(`✅ Empresa logueada: ${empresa.nombre}`);
    res.status(200).json({
      _id: empresa._id,
      nombre: empresa.nombre,
      email: empresa.email
    });
  } catch (err) {
    console.error("Error en login:", err);
    res.status(500).json({ error: "Error interno del servidor" });
  }
});

// 📌 Añadir empleado
app.post("/api/empleados", async (req, res) => {
  try {
    const { nombre, edad, puesto, rango, entrada, salida, empresaId, password } = req.body;
    if (!nombre || !edad || !puesto || !rango || !entrada || !salida || !empresaId || !password) {
      return res.status(400).json({ error: "Todos los campos son obligatorios" });
    }

    const existe = await Empleado.findOne({ usuario: nombre });
    if (existe) {
      return res.status(400).json({ error: "Ya existe un empleado con este usuario" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const nuevoEmpleado = new Empleado({
      nombre,
      edad,
      puesto,
      rango,
      horario: { entrada, salida },
      usuario: nombre,
      password: hashedPassword,
      rol: "empleado",
      estadoConexion: "inactivo",
      fichado: false,
      ultimoFichaje: new Date(),
      empresaId
    });

    await nuevoEmpleado.save();

    console.log(`✅ Empleado registrado: ${nuevoEmpleado.nombre}`);
    res.status(200).json({ _id: nuevoEmpleado._id });
  } catch (err) {
    console.error("Error registrando empleado:", err);
    res.status(500).json({ error: "Error interno del servidor" });
  }
});

// 📌 Arrancar servidor
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`🟢 NanaSync API corriendo en puerto ${PORT}`);
});
