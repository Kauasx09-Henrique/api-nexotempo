const express = require('express');
const bcrypt = require('bcryptjs');
const pool = require('../db');
const { autenticar, apenasEmpresaOuGestao } = require('../middlewares/auth');

const router = express.Router();

router.use(autenticar);

router.post('/', apenasEmpresaOuGestao, async (req, res) => {
  const { nome, cpf, pis = null, email, senha, cargo = null, perfil = 'COLABORADOR' } = req.body;

  if (!nome || !cpf || !email || !senha) {
    return res.status(400).json({ erro: 'Nome, CPF, email e senha sao obrigatorios.' });
  }

  try {
    const senhaHash = await bcrypt.hash(senha, 10);
    const result = await pool.query(
      `INSERT INTO funcionarios (empresa_id, nome, cpf, pis, email, senha_hash, cargo, perfil)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, empresa_id, nome, cpf, pis, email, cargo, perfil, ativo, criado_em`,
      [req.usuario.empresa_id, nome, cpf, pis, email, senhaHash, cargo, perfil]
    );

    return res.status(201).json(result.rows[0]);
  } catch (error) {
    return res.status(400).json({ erro: 'Erro ao cadastrar funcionario.', detalhe: error.message });
  }
});

router.get('/', apenasEmpresaOuGestao, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, nome, cpf, pis, email, cargo, perfil, ativo, criado_em
       FROM funcionarios
       WHERE empresa_id = $1
       ORDER BY nome ASC`,
      [req.usuario.empresa_id]
    );
    return res.json(result.rows);
  } catch (error) {
    return res.status(500).json({ erro: 'Erro ao listar funcionarios.' });
  }
});

router.get('/:id', apenasEmpresaOuGestao, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, nome, cpf, pis, email, cargo, perfil, ativo, criado_em
       FROM funcionarios
       WHERE id = $1 AND empresa_id = $2`,
      [req.params.id, req.usuario.empresa_id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ erro: 'Funcionario nao encontrado.' });
    }
    return res.json(result.rows[0]);
  } catch (error) {
    return res.status(500).json({ erro: 'Erro ao buscar funcionario.' });
  }
});

router.put('/:id', apenasEmpresaOuGestao, async (req, res) => {
  const { nome, pis, email, senha, cargo, perfil, ativo } = req.body;

  try {
    let senhaHash = null;
    if (senha) {
      senhaHash = await bcrypt.hash(senha, 10);
    }

    const result = await pool.query(
      `UPDATE funcionarios
       SET nome = COALESCE($1, nome),
           pis = COALESCE($2, pis),
           email = COALESCE($3, email),
           senha_hash = COALESCE($4, senha_hash),
           cargo = COALESCE($5, cargo),
           perfil = COALESCE($6, perfil),
           ativo = COALESCE($7, ativo)
       WHERE id = $8 AND empresa_id = $9
       RETURNING id, nome, cpf, pis, email, cargo, perfil, ativo`,
      [
        nome || null,
        pis || null,
        email || null,
        senhaHash,
        cargo || null,
        perfil || null,
        ativo !== undefined ? ativo : null,
        req.params.id,
        req.usuario.empresa_id,
      ]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ erro: 'Funcionario nao encontrado.' });
    }
    return res.json(result.rows[0]);
  } catch (error) {
    return res.status(400).json({ erro: 'Erro ao atualizar funcionario.', detalhe: error.message });
  }
});

router.delete('/:id', apenasEmpresaOuGestao, async (req, res) => {
  try {
    const result = await pool.query(
      'UPDATE funcionarios SET ativo = FALSE WHERE id = $1 AND empresa_id = $2 RETURNING id',
      [req.params.id, req.usuario.empresa_id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ erro: 'Funcionario nao encontrado.' });
    }
    return res.json({ mensagem: 'Funcionario desativado com sucesso.' });
  } catch (error) {
    return res.status(500).json({ erro: 'Erro ao desativar funcionario.' });
  }
});

module.exports = router;