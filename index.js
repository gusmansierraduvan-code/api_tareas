const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('./baseDeDatos');

const app = express();
app.use(cors());
app.use(express.json());

const CLAVE_SECRETA = 'clave_super_secreta_cambiar_despues';

app.get('/', (req, res) => {
  res.send('¡La API de tareas está funcionando!');
});

// RUTA DE REGISTRO
app.post('/registro', async (req, res) => {
  const { nombre, apellidos, email, password } = req.body;

  if (!nombre || !apellidos || !email || !password) {
    return res.status(400).json({ error: 'Todos los campos son obligatorios' });
  }

  try {
    const passwordEncriptada = await bcrypt.hash(password, 10);

    db.run(
      `INSERT INTO usuarios (nombre, apellidos, email, password) VALUES (?, ?, ?, ?)`,
      [nombre, apellidos, email, passwordEncriptada],
      function (err) {
        if (err) {
          return res.status(400).json({ error: 'El email ya está registrado' });
        }
        res.status(201).json({ mensaje: 'Usuario registrado con éxito', id: this.lastID });
      }
    );
  } catch (error) {
    res.status(500).json({ error: 'Error al registrar usuario' });
  }
});

// RUTA DE LOGIN
app.post('/login', (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email y contraseña son obligatorios' });
  }

  db.get('SELECT * FROM usuarios WHERE email = ?', [email], async (err, usuario) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    if (!usuario) {
      return res.status(401).json({ error: 'Email o contraseña incorrectos' });
    }

    const passwordCorrecta = await bcrypt.compare(password, usuario.password);
    if (!passwordCorrecta) {
      return res.status(401).json({ error: 'Email o contraseña incorrectos' });
    }

    const token = jwt.sign({ id: usuario.id, email: usuario.email }, CLAVE_SECRETA, { expiresIn: '2h' });

    res.json({
      mensaje: 'Login exitoso',
      token: token,
      usuario: { id: usuario.id, nombre: usuario.nombre, apellidos: usuario.apellidos, email: usuario.email }
    });
  });
});


// MIDDLEWARE: verifica que el usuario tenga token válido
function verificarToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // "Bearer <token>"

  if (!token) {
    return res.status(401).json({ error: 'Token no proporcionado' });
  }

  jwt.verify(token, CLAVE_SECRETA, (err, decoded) => {
    if (err) {
      return res.status(403).json({ error: 'Token inválido o expirado' });
    }
    req.usuario = decoded;
    next();
  });
}

// CREAR TAREA
app.post('/tareas', verificarToken, (req, res) => {
  const { titulo } = req.body;
  if (!titulo) {
    return res.status(400).json({ error: 'El título es obligatorio' });
  }

  db.run(
    `INSERT INTO tareas (titulo, completada, usuarioId) VALUES (?, 0, ?)`,
    [titulo, req.usuario.id],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.status(201).json({ id: this.lastID, titulo, completada: 0 });
    }
  );
});

// LISTAR TAREAS DEL USUARIO LOGUEADO
app.get('/tareas', verificarToken, (req, res) => {
  db.all(
    `SELECT * FROM tareas WHERE usuarioId = ?`,
    [req.usuario.id],
    (err, filas) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(filas);
    }
  );
});

// ACTUALIZAR TAREA (marcar completada / editar título)
app.put('/tareas/:id', verificarToken, (req, res) => {
  const { titulo, completada } = req.body;

  db.run(
    `UPDATE tareas SET titulo = COALESCE(?, titulo), completada = COALESCE(?, completada) WHERE id = ? AND usuarioId = ?`,
    [titulo, completada, req.params.id, req.usuario.id],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      if (this.changes === 0) return res.status(404).json({ error: 'Tarea no encontrada' });
      res.json({ mensaje: 'Tarea actualizada' });
    }
  );
});

// ELIMINAR TAREA
app.delete('/tareas/:id', verificarToken, (req, res) => {
  db.run(
    `DELETE FROM tareas WHERE id = ? AND usuarioId = ?`,
    [req.params.id, req.usuario.id],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      if (this.changes === 0) return res.status(404).json({ error: 'Tarea no encontrada' });
      res.json({ mensaje: 'Tarea eliminada' });
    }
  );
});

const PUERTO = 3000;
app.listen(PUERTO, () => {
  console.log(`Servidor corriendo en http://localhost:${PUERTO}`);
});