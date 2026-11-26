const express = require('express');
const bcrypt = require('bcryptjs');
const pool = require('../db');
const { autenticar, apenasEmpresaOuGestao } = require('../middlewares/auth');

const router = express.Router();

router.post('/', async (req, res) => {
  const { razao_social, cnpj, email, senha, politica_fora_raio = 'ALERTAR' } = req.body;

  if (!razao_social || !cnpj || !email || !senha) {
    return res.status(400).json({ erro: 'Campos obrigatorios ausentes.' });
  }

  try {
    const senhaHash = await bcrypt.hash(senha, 10);
    const result = await pool.query(
      `INSERT INTO empresas (razao_social, cnpj, email, senha_hash, politica_fora_raio)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, razao_social, cnpj, email, politica_fora_raio, ativo, criado_em`,
      [razao_social, cnpj, email, senhaHash, politica_fora_raio]
    );

    return res.status(201).json(result.rows[0]);
  } catch (error) {
    return res.status(400).json({ erro: 'Erro ao cadastrar empresa.', detalhe: error.message });
  }
});

router.get('/', autenticar, apenasEmpresaOuGestao, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, razao_social, cnpj, email, politica_fora_raio, ativo, criado_em FROM empresas WHERE id = $1',
      [req.usuario.empresa_id]
    );
    return res.json(result.rows[0] || null);
  } catch (error) {
    return res.status(500).json({ erro: 'Erro ao buscar empresa.' });
  }
});

router.put('/', autenticar, apenasEmpresaOuGestao, async (req, res) => {
  const { razao_social, email, senha, politica_fora_raio } = req.body;

  try {
    let senhaHash = null;
    if (senha) {
      senhaHash = await bcrypt.hash(senha, 10);
    }

    const result = await pool.query(
      `UPDATE empresas
       SET razao_social = COALESCE($1, razao_social),
           email = COALESCE($2, email),
           senha_hash = COALESCE($3, senha_hash),
           politica_fora_raio = COALESCE($4, politica_fora_raio)
       WHERE id = $5
       RETURNING id, razao_social, cnpj, email, politica_fora_raio, ativo`,
      [razao_social || null, email || null, senhaHash, politica_fora_raio || null, req.usuario.empresa_id]
    );

    return res.json(result.rows[0]);
  } catch (error) {
    return res.status(400).json({ erro: 'Erro ao atualizar empresa.', detalhe: error.message });
  }
});

router.delete('/', autenticar, apenasEmpresaOuGestao, async (req, res) => {
  try {
    await pool.query('UPDATE empresas SET ativo = FALSE WHERE id = $1', [req.usuario.empresa_id]);
    return res.json({ mensagem: 'Empresa desativada com sucesso.' });
  } catch (error) {
    return res.status(500).json({ erro: 'Erro ao desativar empresa.' });
  }
});

module.exports = router;