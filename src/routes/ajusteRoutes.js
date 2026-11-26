const express = require('express');
const pool = require('../db');
const { autenticar, apenasEmpresaOuGestao } = require('../middlewares/auth');

const router = express.Router();

router.use(autenticar);

router.post('/', async (req, res) => {
  const {
    funcionario_id,
    registro_ponto_id = null,
    tipo_ajuste,
    data_hora_ajustada = null,
    tipo_batida_ajustada = null,
    motivo,
  } = req.body;

  const alvoFuncionarioId = req.usuario.tipo === 'FUNCIONARIO' ? req.usuario.id : funcionario_id;

  if (!alvoFuncionarioId || !tipo_ajuste || !motivo) {
    return res.status(400).json({ erro: 'Dados obrigatorios ausentes.' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO ajustes_ponto (
         empresa_id, funcionario_id, registro_ponto_id, tipo_ajuste,
         data_hora_ajustada, tipo_batida_ajustada, motivo, solicitado_por
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        req.usuario.empresa_id,
        alvoFuncionarioId,
        registro_ponto_id,
        tipo_ajuste,
        data_hora_ajustada,
        tipo_batida_ajustada,
        motivo,
        req.usuario.id,
      ]
    );
    return res.status(201).json(result.rows[0]);
  } catch (error) {
    return res.status(400).json({ erro: 'Erro ao solicitar ajuste.', detalhe: error.message });
  }
});

router.get('/', async (req, res) => {
  try {
    const isGestao = req.usuario.tipo === 'EMPRESA' || ['ADMIN', 'RH', 'GESTOR'].includes(req.usuario.perfil);
    const query = isGestao
      ? 'SELECT * FROM ajustes_ponto WHERE empresa_id = $1 ORDER BY criado_em DESC'
      : 'SELECT * FROM ajustes_ponto WHERE empresa_id = $1 AND funcionario_id = $2 ORDER BY criado_em DESC';
    const params = isGestao ? [req.usuario.empresa_id] : [req.usuario.empresa_id, req.usuario.id];

    const result = await pool.query(query, params);
    return res.json(result.rows);
  } catch (error) {
    return res.status(500).json({ erro: 'Erro ao listar ajustes.' });
  }
});

router.put('/:id/status', apenasEmpresaOuGestao, async (req, res) => {
  const { status } = req.body;
  if (!['APROVADO', 'REJEITADO'].includes(status)) {
    return res.status(400).json({ erro: 'Status deve ser APROVADO ou REJEITADO.' });
  }

  try {
    const aprovadorId = req.usuario.tipo === 'FUNCIONARIO' ? req.usuario.id : null;
    const result = await pool.query(
      `UPDATE ajustes_ponto
       SET status = $1, aprovado_por = $2, analisado_em = NOW()
       WHERE id = $3 AND empresa_id = $4
       RETURNING *`,
      [status, aprovadorId, req.params.id, req.usuario.empresa_id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ erro: 'Ajuste nao encontrado.' });
    }
    return res.json(result.rows[0]);
  } catch (error) {
    return res.status(400).json({ erro: 'Erro ao analisar ajuste.' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const result = await pool.query(
      `DELETE FROM ajustes_ponto
       WHERE id = $1 AND empresa_id = $2 AND status = 'PENDENTE'
       RETURNING id`,
      [req.params.id, req.usuario.empresa_id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ erro: 'Ajuste nao encontrado ou ja analisado.' });
    }
    return res.json({ mensagem: 'Ajuste cancelado com sucesso.' });
  } catch (error) {
    return res.status(500).json({ erro: 'Erro ao cancelar ajuste.' });
  }
});

module.exports = router;