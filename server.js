const express = require('express');
const cors = require('cors');
require('dotenv').config();

const authRoutes = require('./src/routes/authRoutes');
const empresaRoutes = require('./src/routes/empresaRoutes');
const funcionarioRoutes = require('./src/routes/funcionarioRoutes');
const localRoutes = require('./src/routes/localRoutes');
const ajusteRoutes = require('./src/routes/ajusteRoutes');
const pontoRoutes = require('./src/routes/pontoRoutes');
const adminRoutes = require('./src/routes/adminRoutes');

const app = express();

app.use(cors());
app.use(express.json());

app.use('/auth', authRoutes);
app.use('/empresas', empresaRoutes);
app.use('/funcionarios', funcionarioRoutes);
app.use('/locais', localRoutes);
app.use('/ajustes', ajusteRoutes);
app.use('/ponto', pontoRoutes);
app.use('/admin', adminRoutes);

const PORT = process.env.PORT || 3333;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});