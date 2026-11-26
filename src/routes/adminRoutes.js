const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const PDFDocument = require('pdfkit');
const pool = require('../db');

const router = express.Router();

function autenticarAdmin(req, res, next) {
  const authHeader = req.headers.authorization;
  let token = null;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
  } else if (req.query && req.query.token) {
    token = String(req.query.token);
  }

  if (!token) {
    return res.status(401).json({ erro: 'Token nao informado.' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const ehAdmin =
      decoded.tipo === 'EMPRESA' ||
      decoded.perfil === 'ADMIN' ||
      decoded.perfil === 'RH';

    if (!ehAdmin) {
      return res.status(403).json({ erro: 'Acesso restrito a administradores.' });
    }

    req.usuario = decoded;
    return next();
  } catch (error) {
    return res.status(401).json({ erro: 'Token invalido ou expirado.' });
  }
}

router.use(autenticarAdmin);

router.get('/dashboard', async (req, res) => {
  const empresaId = req.usuario.empresa_id;

  try {
    const empresaRes = await pool.query(
      'SELECT id, razao_social, cnpj, email, politica_fora_raio FROM empresas WHERE id = $1',
      [empresaId]
    );

    const funcsRes = await pool.query(
      `SELECT id, nome, cpf, pis, email, cargo, perfil, ativo
       FROM funcionarios
       WHERE empresa_id = $1
       ORDER BY ativo DESC, nome ASC`,
      [empresaId]
    );

    const locaisRes = await pool.query(
      `SELECT id, nome, endereco, latitude, longitude, raio_metros, precisao_maxima_metros
       FROM locais_permitidos
       WHERE empresa_id = $1
       ORDER BY nome ASC`,
      [empresaId]
    );

    let registros = [];
    try {
      const pontosRes = await pool.query(
        `SELECT r.*, f.nome AS funcionario_nome, f.cargo AS funcionario_cargo
         FROM registros_ponto r
         JOIN funcionarios f ON f.id = r.funcionario_id
         WHERE r.empresa_id = $1
         ORDER BY r.nsr DESC
         LIMIT 30`,
        [empresaId]
      );
      registros = pontosRes.rows;
    } catch (erroPontos) {
      console.log('Aviso ao buscar registros_ponto:', erroPontos.message);
    }

    const hojeStr = new Date().toISOString().slice(0, 10);
    const pontosHoje = registros.filter((r) => {
      const dataBruta = r.data_hora_servidor || r.data_hora || r.criado_em || r.created_at;
      if (!dataBruta) return false;
      return new Date(dataBruta).toISOString().slice(0, 10) === hojeStr;
    });

    const alertasForaRaio = pontosHoje.filter(
      (r) => r.fora_do_raio === true || r.dentro_raio === false
    ).length;

    return res.json({
      empresa: empresaRes.rows[0] || null,
      resumo: {
        total_colaboradores: funcsRes.rows.filter((f) => f.ativo).length,
        total_locais: locaisRes.rowCount,
        pontos_hoje: pontosHoje.length,
        alertas_fora_raio: alertasForaRaio,
      },
      funcionarios: funcsRes.rows,
      locais: locaisRes.rows,
      registros,
    });
  } catch (error) {
    return res.status(500).json({ erro: 'Erro ao carregar painel administrativo.', detalhe: error.message });
  }
});

router.post('/funcionarios', async (req, res) => {
  const empresaId = req.usuario.empresa_id;
  const { nome, cpf, pis, email, senha, cargo, perfil } = req.body;

  if (!nome || !cpf || !email || !senha) {
    return res.status(400).json({ erro: 'Preencha nome, CPF, e-mail e senha.' });
  }

  const cpfLimpo = cpf.replace(/\D/g, '');
  const pisLimpo = (pis || cpfLimpo).replace(/\D/g, '');
  const emailLimpo = email.trim().toLowerCase();
  const perfilFinal = ['ADMIN', 'RH', 'COLABORADOR'].includes(perfil) ? perfil : 'COLABORADOR';

  try {
    const senhaHash = await bcrypt.hash(senha, 10);

    const novoFunc = await pool.query(
      `INSERT INTO funcionarios (empresa_id, nome, cpf, pis, email, senha_hash, cargo, perfil)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, nome, cpf, pis, email, cargo, perfil, ativo`,
      [empresaId, nome.trim(), cpfLimpo, pisLimpo, emailLimpo, senhaHash, cargo || 'Colaborador', perfilFinal]
    );

    const funcionario = novoFunc.rows[0];

    await pool.query(
      `INSERT INTO funcionarios_locais (funcionario_id, local_id)
       SELECT $1, id FROM locais_permitidos WHERE empresa_id = $2
       ON CONFLICT DO NOTHING`,
      [funcionario.id, empresaId]
    );

    return res.status(201).json({ funcionario });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ erro: 'CPF ou e-mail ja cadastrado no sistema.' });
    }
    return res.status(500).json({ erro: 'Erro ao cadastrar colaborador.', detalhe: error.message });
  }
});

router.patch('/funcionarios/:id/status', async (req, res) => {
  const empresaId = req.usuario.empresa_id;
  const { id } = req.params;
  const { ativo } = req.body;

  try {
    const result = await pool.query(
      `UPDATE funcionarios
       SET ativo = $1
       WHERE id = $2 AND empresa_id = $3
       RETURNING id, nome, ativo`,
      [Boolean(ativo), id, empresaId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ erro: 'Colaborador nao encontrado.' });
    }

    return res.json({ funcionario: result.rows[0] });
  } catch (error) {
    return res.status(500).json({ erro: 'Erro ao atualizar status do colaborador.' });
  }
});

router.post('/locais', async (req, res) => {
  const empresaId = req.usuario.empresa_id;
  const { nome, endereco, latitude, longitude, raio_metros } = req.body;

  if (!nome || latitude === undefined || longitude === undefined) {
    return res.status(400).json({ erro: 'Informe nome, latitude e longitude.' });
  }

  try {
    const novoLocal = await pool.query(
      `INSERT INTO locais_permitidos (
         empresa_id, nome, endereco, latitude, longitude, raio_metros, precisao_maxima_metros
       )
       VALUES ($1, $2, $3, $4, $5, $6, 100)
       RETURNING id, nome, endereco, latitude, longitude, raio_metros, precisao_maxima_metros`,
      [
        empresaId,
        nome.trim(),
        endereco || '',
        Number(latitude),
        Number(longitude),
        Number(raio_metros) || 150,
      ]
    );

    const local = novoLocal.rows[0];

    await pool.query(
      `INSERT INTO funcionarios_locais (funcionario_id, local_id)
       SELECT id, $1 FROM funcionarios WHERE empresa_id = $2
       ON CONFLICT DO NOTHING`,
      [local.id, empresaId]
    );

    return res.status(201).json({ local });
  } catch (error) {
    return res.status(500).json({ erro: 'Erro ao cadastrar local.', detalhe: error.message });
  }
});

router.get('/espelho-pdf', async (req, res) => {
  const empresaId = req.usuario.empresa_id;
  const { funcionario_id, data_inicio, data_fim } = req.query;

  if (!funcionario_id) {
    return res.status(400).json({ erro: 'Informe o colaborador para gerar o espelho.' });
  }

  try {
    const empRes = await pool.query(
      'SELECT razao_social, cnpj, email FROM empresas WHERE id = $1',
      [empresaId]
    );
    const funcRes = await pool.query(
      'SELECT id, nome, cpf, pis, cargo, email FROM funcionarios WHERE id = $1 AND empresa_id = $2',
      [funcionario_id, empresaId]
    );

    if (funcRes.rowCount === 0) {
      return res.status(404).json({ erro: 'Colaborador nao encontrado.' });
    }

    const empresa = empRes.rows[0] || {};
    const funcionario = funcRes.rows[0];

    let registros = [];
    try {
      const pontosRes = await pool.query(
        `SELECT *
         FROM registros_ponto
         WHERE empresa_id = $1 AND funcionario_id = $2
         ORDER BY nsr ASC`,
        [empresaId, funcionario_id]
      );
      registros = pontosRes.rows;
    } catch (erroPontos) {
      registros = [];
    }

    const inicioFiltro = data_inicio ? new Date(`${data_inicio}T00:00:00`) : null;
    const fimFiltro = data_fim ? new Date(`${data_fim}T23:59:59`) : null;

    const filtrados = registros.filter((r) => {
      const bruto = r.data_hora_servidor || r.data_hora || r.criado_em || r.created_at;
      if (!bruto) return true;
      const dt = new Date(bruto);
      if (inicioFiltro && dt < inicioFiltro) return false;
      if (fimFiltro && dt > fimFiltro) return false;
      return true;
    });

    const nomeArquivo = `espelho-${funcionario.nome.toLowerCase().replace(/[^a-z0-9]/g, '-')}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${nomeArquivo}"`);

    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    doc.pipe(res);

    doc.rect(0, 0, doc.page.width, 92).fill('#132A3A');
    doc.fillColor('#FFFFFF').fontSize(20).font('Helvetica-Bold').text('NexoTempo', 40, 26);
    doc
      .fillColor('#F4B942')
      .fontSize(9)
      .font('Helvetica-Bold')
      .text('ESPELHO DE PONTO ELETRONICO · PORTARIA MTP 671/2021 (REP-P)', 40, 52);
    doc
      .fillColor('#CBD5E1')
      .fontSize(8)
      .font('Helvetica')
      .text(`Emitido em: ${new Date().toLocaleString('pt-BR')}`, 40, 68);

    let y = 112;
    doc.roundedRect(40, y, 515, 86, 8).fillAndStroke('#F8FAFC', '#E2E8F0');
    doc.fillColor('#132A3A').font('Helvetica-Bold').fontSize(10).text('EMPREGADOR', 54, y + 12);
    doc
      .font('Helvetica')
      .fontSize(9)
      .text(`${empresa.razao_social || 'Empresa'}   |   CNPJ: ${empresa.cnpj || '-'}`, 54, y + 26);

    doc.font('Helvetica-Bold').fontSize(10).text('COLABORADOR', 54, y + 46);
    doc
      .font('Helvetica')
      .fontSize(9)
      .text(
        `${funcionario.nome}   |   CPF: ${funcionario.cpf || '-'}   |   PIS: ${funcionario.pis || '-'}`,
        54,
        y + 60
      );
    doc.text(
      `Cargo: ${funcionario.cargo || 'Colaborador'}   |   Periodo: ${data_inicio || 'Inicio'} ate ${data_fim || 'Atual'}`,
      54,
      y + 72
    );

    y += 108;
    doc.rect(40, y, 515, 24).fill('#087F8C');
    doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(8.5);
    doc.text('NSR', 48, y + 8);
    doc.text('DATA / HORA', 100, y + 8);
    doc.text('TIPO', 210, y + 8);
    doc.text('VALIDACAO GPS', 295, y + 8);
    doc.text('HASH SHA-256', 405, y + 8);
    y += 28;

    if (filtrados.length === 0) {
      doc
        .fillColor('#64748B')
        .font('Helvetica')
        .fontSize(10)
        .text('Nenhum registro de ponto encontrado no periodo selecionado.', 40, y + 16);
      y += 46;
    } else {
      filtrados.forEach((reg, idx) => {
        if (y > 720) {
          doc.addPage();
          y = 50;
        }

        if (idx % 2 === 1) {
          doc.rect(40, y - 4, 515, 22).fill('#F1F5F9');
        }

        const bruto = reg.data_hora_servidor || reg.data_hora || reg.criado_em || reg.created_at;
        const dtTexto = bruto ? new Date(bruto).toLocaleString('pt-BR') : '-';
        const fora = reg.fora_do_raio === true || reg.dentro_raio === false;
        const hashRaw = reg.hash_sha256 || reg.hash_registro || reg.hash || '-';
        const hashCurto = hashRaw.length > 20 ? `${hashRaw.slice(0, 18)}...` : hashRaw;

        doc.fillColor('#132A3A').font('Helvetica').fontSize(8.5);
        doc.text(String(reg.nsr || '-'), 48, y + 2);
        doc.text(dtTexto, 100, y + 2);
        doc.text(String(reg.tipo || 'PONTO'), 210, y + 2);
        doc
          .fillColor(fora ? '#D97706' : '#059669')
          .text(fora ? 'Fora do raio' : 'Dentro do raio', 295, y + 2);
        doc.fillColor('#475569').text(hashCurto, 405, y + 2);

        y += 22;
      });
    }

    if (y > 690) {
      doc.addPage();
      y = 60;
    } else {
      y += 34;
    }

    doc.strokeColor('#94A3B8').lineWidth(0.8);
    doc.moveTo(50, y + 30).lineTo(250, y + 30).stroke();
    doc.moveTo(320, y + 30).lineTo(520, y + 30).stroke();

    doc.fillColor('#132A3A').font('Helvetica').fontSize(8.5);
    doc.text(empresa.razao_social || 'Assinatura do Empregador', 50, y + 36, {
      width: 200,
      align: 'center',
    });
    doc.text(funcionario.nome, 320, y + 36, {
      width: 200,
      align: 'center',
    });

    doc.end();
  } catch (error) {
    return res.status(500).json({ erro: 'Erro ao gerar PDF.', detalhe: error.message });
  }
});

module.exports = router;