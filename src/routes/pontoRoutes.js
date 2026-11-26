const express = require('express');
const PDFDocument = require('pdfkit');
const pool = require('../db');
const { autenticar, apenasEmpresaOuGestao } = require('../middlewares/auth');

const router = express.Router();

router.use(autenticar);

router.get('/meus-locais', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT l.id, l.nome, l.endereco, l.latitude, l.longitude, l.raio_metros, l.precisao_maxima_metros
       FROM locais_permitidos l
       INNER JOIN funcionarios_locais fl ON fl.local_id = l.id
       WHERE fl.funcionario_id = $1 AND l.ativo = TRUE`,
      [req.usuario.id]
    );
    return res.json(result.rows);
  } catch (error) {
    return res.status(500).json({ erro: 'Erro ao buscar locais permitidos.' });
  }
});

router.post('/registrar', async (req, res) => {
const {
  tipo,
  latitude,
  longitude,
  precisao_metros,
  local_id,
  justificativa,
  client_id,
  data_hora_dispositivo,
  origem_offline,
} = req.body;

if (client_id) {
  const existente = await pool.query(
    'SELECT * FROM registros_ponto WHERE empresa_id = $1 AND client_id = $2 LIMIT 1',
    [req.usuario.empresa_id, client_id]
  );

  if (existente.rowCount > 0) {
    return res.status(200).json({
      mensagem: 'Registro ja sincronizado anteriormente.',
      duplicado: true,
      registro: existente.rows[0],
    });
  }
}

  const funcionario_id = req.usuario.id;

  if (!tipo_batida || latitude == null || longitude == null || precisao_gps_metros == null) {
    return res.status(400).json({ erro: 'Dados obrigatorios ausentes.' });
  }

  if (mock_location_detectado === true) {
    return res.status(403).json({ erro: 'Localizacao simulada detectada. Registro bloqueado.' });
  }

  try {
    const funcResult = await pool.query(
      `SELECT f.id, f.empresa_id, e.politica_fora_raio
       FROM funcionarios f
       INNER JOIN empresas e ON e.id = f.empresa_id
       WHERE f.id = $1 AND f.ativo = TRUE AND e.ativo = TRUE`,
      [funcionario_id]
    );

    if (funcResult.rowCount === 0) {
      return res.status(404).json({ erro: 'Funcionario ou empresa nao encontrado.' });
    }

    const { empresa_id, politica_fora_raio } = funcResult.rows[0];

    const localResult = await pool.query(
      `SELECT
         l.id,
         l.nome,
         l.raio_metros,
         l.precisao_maxima_metros,
         calcular_distancia_metros($2, $3, l.latitude, l.longitude) AS distancia_metros
       FROM locais_permitidos l
       INNER JOIN funcionarios_locais fl ON fl.local_id = l.id
       WHERE fl.funcionario_id = $1 AND l.ativo = TRUE
       ORDER BY distancia_metros ASC
       LIMIT 1`,
      [funcionario_id, latitude, longitude]
    );

    if (localResult.rowCount === 0) {
      return res.status(400).json({ erro: 'Nenhum local permitido vinculado a este funcionario.' });
    }

    const localMaisProximo = localResult.rows[0];
    const distancia = Number(localMaisProximo.distancia_metros);
    const precisaoRuim = Number(precisao_gps_metros) > localMaisProximo.precisao_maxima_metros;
    const foraDoRaio = distancia > localMaisProximo.raio_metros;

    if (precisaoRuim && politica_fora_raio === 'BLOQUEAR') {
      return res.status(400).json({
        erro: 'Sinal de GPS impreciso. Aguarde a calibracao e tente novamente.',
        precisao_atual: precisao_gps_metros,
        precisao_maxima: localMaisProximo.precisao_maxima_metros,
      });
    }

    if (foraDoRaio) {
      if (politica_fora_raio === 'BLOQUEAR') {
        return res.status(403).json({
          erro: 'Voce esta fora do raio permitido para bater o ponto.',
          local_mais_proximo: localMaisProximo.nome,
          distancia_metros: Math.round(distancia),
          raio_permitido: localMaisProximo.raio_metros,
        });
      }

      if (!justificativa_fora_raio || justificativa_fora_raio.trim() === '') {
        return res.status(400).json({
          erro: 'Justificativa obrigatoria para batida fora do raio permitido.',
          fora_do_raio: true,
          distancia_metros: Math.round(distancia),
        });
      }
    }

    const ipOrigem = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress;

    const insertResult = await pool.query(
      `INSERT INTO registros_ponto (
         empresa_id, funcionario_id, local_id, tipo_batida, data_hora_dispositivo,
         registro_offline, latitude, longitude, precisao_gps_metros, distancia_local_metros,
         fora_do_raio, justificativa_fora_raio, mock_location_detectado, ip_origem, dispositivo_info
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
       RETURNING id, nsr, tipo_batida, data_hora_servidor, distancia_local_metros, fora_do_raio, hash_atual`,
      [
        empresa_id,
        funcionario_id,
        localMaisProximo.id,
        tipo_batida,
        data_hora_dispositivo || new Date().toISOString(),
        registro_offline,
        latitude,
        longitude,
        precisao_gps_metros,
        distancia,
        foraDoRaio,
        justificativa_fora_raio,
        mock_location_detectado,
        ipOrigem,
        dispositivo_info ? JSON.stringify(dispositivo_info) : null,
      ]
    );

    return res.status(201).json({
      mensagem: 'Ponto registrado com sucesso.',
      registro: insertResult.rows[0],
    });
  } catch (error) {
    return res.status(500).json({ erro: 'Erro ao registrar ponto.', detalhe: error.message });
  }
});

router.get('/registros', async (req, res) => {
  const { funcionario_id, data_inicio, data_fim } = req.query;
  const isGestao = req.usuario.tipo === 'EMPRESA' || ['ADMIN', 'RH', 'GESTOR'].includes(req.usuario.perfil);
  const filtroFuncionario = isGestao ? funcionario_id || null : req.usuario.id;

  try {
    const result = await pool.query(
      `SELECT r.id, r.nsr, r.tipo_batida, r.data_hora_servidor, r.distancia_local_metros,
              r.fora_do_raio, r.justificativa_fora_raio, r.hash_atual,
              f.nome AS funcionario_nome, f.cpf AS funcionario_cpf, l.nome AS local_nome
       FROM registros_ponto r
       INNER JOIN funcionarios f ON f.id = r.funcionario_id
       LEFT JOIN locais_permitidos l ON l.id = r.local_id
       WHERE r.empresa_id = $1
         AND ($2::UUID IS NULL OR r.funcionario_id = $2)
         AND ($3::TIMESTAMPTZ IS NULL OR r.data_hora_servidor >= $3)
         AND ($4::TIMESTAMPTZ IS NULL OR r.data_hora_servidor <= $4)
       ORDER BY r.data_hora_servidor DESC`,
      [req.usuario.empresa_id, filtroFuncionario, data_inicio || null, data_fim || null]
    );

    return res.json(result.rows);
  } catch (error) {
    return res.status(500).json({ erro: 'Erro ao listar registros.' });
  }
});

router.get('/relatorio/pdf', apenasEmpresaOuGestao, async (req, res) => {
  const { funcionario_id, data_inicio, data_fim } = req.query;

  try {
    const empresaRes = await pool.query(
      'SELECT razao_social, cnpj FROM empresas WHERE id = $1',
      [req.usuario.empresa_id]
    );
    const empresa = empresaRes.rows[0];

    const registrosRes = await pool.query(
      `SELECT r.nsr, r.tipo_batida, r.data_hora_servidor, r.distancia_local_metros,
              r.fora_do_raio, r.hash_atual, f.nome AS funcionario_nome, f.cpf, l.nome AS local_nome
       FROM registros_ponto r
       INNER JOIN funcionarios f ON f.id = r.funcionario_id
       LEFT JOIN locais_permitidos l ON l.id = r.local_id
       WHERE r.empresa_id = $1
         AND ($2::UUID IS NULL OR r.funcionario_id = $2)
         AND ($3::TIMESTAMPTZ IS NULL OR r.data_hora_servidor >= $3)
         AND ($4::TIMESTAMPTZ IS NULL OR r.data_hora_servidor <= $4)
       ORDER BY r.data_hora_servidor ASC`,
      [req.usuario.empresa_id, funcionario_id || null, data_inicio || null, data_fim || null]
    );

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="relatorio-ponto.pdf"');

    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    doc.pipe(res);

    doc.fontSize(16).text('Relatorio de Registro de Ponto', { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(10).text(`Empresa: ${empresa.razao_social} | CNPJ: ${empresa.cnpj}`);
    doc.text(`Emitido em: ${new Date().toLocaleString('pt-BR')}`);
    if (data_inicio || data_fim) {
      doc.text(`Periodo: ${data_inicio || 'Inicio'} ate ${data_fim || 'Atual'}`);
    }
    doc.moveDown(1);

    if (registrosRes.rowCount === 0) {
      doc.fontSize(11).text('Nenhum registro encontrado para os filtros informados.');
    } else {
      registrosRes.rows.forEach((reg) => {
        const dataFormatada = new Date(reg.data_hora_servidor).toLocaleString('pt-BR');
        const statusLocal = reg.fora_do_raio ? 'FORA DO RAIO' : 'DENTRO DO RAIO';
        const dist = reg.distancia_local_metros != null ? `${Math.round(reg.distancia_local_metros)}m` : '-';

        doc.fontSize(9).text(
          `NSR: ${reg.nsr} | ${dataFormatada} | ${reg.tipo_batida} | ${reg.funcionario_nome} (CPF: ${reg.cpf})`
        );
        doc.fontSize(8).fillColor('#555555').text(
          `Local: ${reg.local_nome || '-'} (${dist} - ${statusLocal}) | Hash: ${reg.hash_atual.slice(0, 16)}...`
        );
        doc.fillColor('#000000').moveDown(0.5);
      });
    }

    doc.end();
  } catch (error) {
    return res.status(500).json({ erro: 'Erro ao gerar relatorio em PDF.', detalhe: error.message });
  }
});


module.exports = router;