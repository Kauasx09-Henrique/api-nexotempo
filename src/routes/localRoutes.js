const express = require('express');
const pool = require('../db');
const { autenticar, apenasEmpresaOuGestao } = require('../middlewares/auth');

const router = express.Router();

router.use(autenticar, apenasEmpresaOuGestao);

router.post('/', async (req, res) => {
  const { nome, endereco = null, latitude, longitude, raio_metros = 100, precisao_maxima_metros = 60 } = req.body;

  if (!nome || latitude == null || longitude == null) {
    return res.status(400).json({ erro: 'Nome, latitude e longitude sao obrigatorios.' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO locais_permitidos (empresa_id, nome, endereco, latitude, longitude, raio_metros, precisao_maxima_metros)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [req.usuario.empresa_id, nome, endereco, latitude, longitude, raio_metros, precisao_maxima_metros]
    );
    return res.status(201).json(result.rows[0]);
  } catch (error) {
    return res.status(400).json({ erro: 'Erro ao cadastrar local.', detalhe: error.message });
  }
});

router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM locais_permitidos WHERE empresa_id = $1 ORDER BY nome ASC',
      [req.usuario.empresa_id]
    );
    return res.json(result.rows);
  } catch (error) {
    return res.status(500).json({ erro: 'Erro ao listar locais.' });
  }
});

router.put('/:id', async (req, res) => {
  const { nome, endereco, latitude, longitude, raio_metros, precisao_maxima_metros, ativo } = req.body;

  try {
    const result = await pool.query(
      `UPDATE locais_permitidos
       SET nome = COALESCE($1, nome),
           endereco = COALESCE($2, endereco),
           latitude = COALESCE($3, latitude),
           longitude = COALESCE($4, longitude),
           raio_metros = COALESCE($5, raio_metros),
           precisao_maxima_metros = COALESCE($6, precisao_maxima_metros),
           ativo = COALESCE($7, ativo)
       WHERE id = $8 AND empresa_id = $9
       RETURNING *`,
      [
        nome || null,
        endereco || null,
        latitude ?? null,
        longitude ?? null,
        raio_metros ?? null,
        precisao_maxima_metros ?? null,
        ativo !== undefined ? ativo : null,
        req.params.id,
        req.usuario.empresa_id,
      ]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ erro: 'Local nao encontrado.' });
    }
    return res.json(result.rows[0]);
  } catch (error) {
    return res.status(400).json({ erro: 'Erro ao atualizar local.', detalhe: error.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM locais_permitidos WHERE id = $1 AND empresa_id = $2 RETURNING id',
      [req.params.id, req.usuario.empresa_id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ erro: 'Local nao encontrado.' });
    }
    return res.json({ mensagem: 'Local removido com sucesso.' });
  } catch (error) {
    return res.status(500).json({ erro: 'Erro ao remover local.' });
  }
});

router.post('/:local_id/vincular', async (req, res) => {
  const { funcionario_id } = req.body;
  if (!funcionario_id) {
    return res.status(400).json({ erro: 'funcionario_id e obrigatorio.' });
  }

  try {
    await pool.query(
      `INSERT INTO funcionarios_locais (funcionario_id, local_id)
       VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
      [funcionario_id, req.params.local_id]
    );
    return res.status(201).json({ mensagem: 'Funcionario vinculado ao local.' });
  } catch (error) {
    return res.status(400).json({ erro: 'Erro ao vincular funcionario.', detalhe: error.message });
  }
});

router.delete('/:local_id/desvincular/:funcionario_id', async (req, res) => {
  try {
    await pool.query(
      'DELETE FROM funcionarios_locais WHERE local_id = $1 AND funcionario_id = $2',
      [req.params.local_id, req.params.funcionario_id]
    );
    return res.json({ mensagem: 'Vinculo removido com sucesso.' });
  } catch (error) {
    return res.status(500).json({ erro: 'Erro ao remover vinculo.' });
  }
});

module.exports = router;