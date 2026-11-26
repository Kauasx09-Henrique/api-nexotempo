const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const pool = require('../db');

const router = express.Router();

router.post('/login', async (req, res) => {
  const { email, senha } = req.body;
  if (!email || !senha) {
    return res.status(400).json({ erro: 'Email e senha sao obrigatorios.' });
  }

  const emailLimpo = email.trim().toLowerCase();

  try {
    const funcResult = await pool.query(
      'SELECT id, empresa_id, nome, cpf, email, cargo, perfil, senha_hash FROM funcionarios WHERE LOWER(email) = $1 AND ativo = TRUE',
      [emailLimpo]
    );

    if (funcResult.rowCount > 0) {
      const funcionario = funcResult.rows[0];
      if (!funcionario.senha_hash) {
        return res.status(401).json({ erro: 'Credenciais invalidas.' });
      }

      const senhaValida = await bcrypt.compare(senha, funcionario.senha_hash);
      if (!senhaValida) {
        return res.status(401).json({ erro: 'Credenciais invalidas.' });
      }

      const token = jwt.sign(
        {
          id: funcionario.id,
          empresa_id: funcionario.empresa_id,
          perfil: funcionario.perfil,
          tipo: 'FUNCIONARIO',
        },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
      );

      return res.json({
        token,
        usuario: {
          id: funcionario.id,
          empresa_id: funcionario.empresa_id,
          nome: funcionario.nome,
          cpf: funcionario.cpf,
          email: funcionario.email,
          cargo: funcionario.cargo,
          perfil: funcionario.perfil,
          tipo: 'FUNCIONARIO',
        },
      });
    }

    const empResult = await pool.query(
      'SELECT id, razao_social, cnpj, email, senha_hash FROM empresas WHERE LOWER(email) = $1 AND ativo = TRUE',
      [emailLimpo]
    );

    if (empResult.rowCount > 0) {
      const empresa = empResult.rows[0];
      if (!empresa.senha_hash) {
        return res.status(401).json({ erro: 'Credenciais invalidas.' });
      }

      const senhaValida = await bcrypt.compare(senha, empresa.senha_hash);
      if (!senhaValida) {
        return res.status(401).json({ erro: 'Credenciais invalidas.' });
      }

      const token = jwt.sign(
        {
          id: empresa.id,
          empresa_id: empresa.id,
          perfil: 'ADMIN',
          tipo: 'EMPRESA',
        },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
      );

      return res.json({
        token,
        usuario: {
          id: empresa.id,
          empresa_id: empresa.id,
          nome: empresa.razao_social,
          cnpj: empresa.cnpj,
          email: empresa.email,
          perfil: 'ADMIN',
          tipo: 'EMPRESA',
        },
      });
    }

    return res.status(401).json({ erro: 'Credenciais invalidas.' });
  } catch (error) {
    return res.status(500).json({ erro: 'Erro ao realizar login.', detalhe: error.message });
  }
});

router.post('/empresa/login', async (req, res) => {
  const { email, senha } = req.body;
  if (!email || !senha) {
    return res.status(400).json({ erro: 'Email e senha sao obrigatorios.' });
  }

  const emailLimpo = email.trim().toLowerCase();

  try {
    const result = await pool.query(
      'SELECT id, razao_social, cnpj, email, senha_hash FROM empresas WHERE LOWER(email) = $1 AND ativo = TRUE',
      [emailLimpo]
    );

    if (result.rowCount === 0 || !result.rows[0].senha_hash) {
      return res.status(401).json({ erro: 'Credenciais invalidas.' });
    }

    const empresa = result.rows[0];
    const senhaValida = await bcrypt.compare(senha, empresa.senha_hash);
    if (!senhaValida) {
      return res.status(401).json({ erro: 'Credenciais invalidas.' });
    }

    const token = jwt.sign(
      { id: empresa.id, empresa_id: empresa.id, perfil: 'ADMIN', tipo: 'EMPRESA' },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    return res.json({
      token,
      empresa: {
        id: empresa.id,
        razao_social: empresa.razao_social,
        cnpj: empresa.cnpj,
        email: empresa.email,
      },
    });
  } catch (error) {
    return res.status(500).json({ erro: 'Erro ao realizar login.', detalhe: error.message });
  }
});

router.post('/funcionario/login', async (req, res) => {
  const { email, senha } = req.body;
  if (!email || !senha) {
    return res.status(400).json({ erro: 'Email e senha sao obrigatorios.' });
  }

  const emailLimpo = email.trim().toLowerCase();

  try {
    const result = await pool.query(
      'SELECT id, empresa_id, nome, cpf, email, cargo, perfil, senha_hash FROM funcionarios WHERE LOWER(email) = $1 AND ativo = TRUE',
      [emailLimpo]
    );

    if (result.rowCount === 0 || !result.rows[0].senha_hash) {
      return res.status(401).json({ erro: 'Credenciais invalidas.' });
    }

    const funcionario = result.rows[0];
    const senhaValida = await bcrypt.compare(senha, funcionario.senha_hash);
    if (!senhaValida) {
      return res.status(401).json({ erro: 'Credenciais invalidas.' });
    }

    const token = jwt.sign(
      {
        id: funcionario.id,
        empresa_id: funcionario.empresa_id,
        perfil: funcionario.perfil,
        tipo: 'FUNCIONARIO',
      },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    return res.json({
      token,
      funcionario: {
        id: funcionario.id,
        empresa_id: funcionario.empresa_id,
        nome: funcionario.nome,
        cpf: funcionario.cpf,
        email: funcionario.email,
        cargo: funcionario.cargo,
        perfil: funcionario.perfil,
      },
    });
  } catch (error) {
    return res.status(500).json({ erro: 'Erro ao realizar login.', detalhe: error.message });
  }
});

router.post('/esqueci-senha', async (req, res) => {
  const { email } = req.body;
  if (!email || !email.trim()) {
    return res.status(400).json({ erro: 'Informe o e-mail cadastrado.' });
  }

  const emailLimpo = email.trim().toLowerCase();
  const codigo = crypto.randomInt(100000, 999999).toString();

  try {
    const funcResult = await pool.query(
      'SELECT id FROM funcionarios WHERE LOWER(email) = $1 AND ativo = TRUE',
      [emailLimpo]
    );

    if (funcResult.rowCount > 0) {
      await pool.query(
        `UPDATE funcionarios
         SET codigo_reset_senha = $1,
             codigo_reset_expira = NOW() + INTERVAL '15 minutes'
         WHERE id = $2`,
        [codigo, funcResult.rows[0].id]
      );
    } else {
      const empResult = await pool.query(
        'SELECT id FROM empresas WHERE LOWER(email) = $1 AND ativo = TRUE',
        [emailLimpo]
      );

      if (empResult.rowCount === 0) {
        return res.status(404).json({ erro: 'Nenhuma conta ativa encontrada com este e-mail.' });
      }

      await pool.query(
        `UPDATE empresas
         SET codigo_reset_senha = $1,
             codigo_reset_expira = NOW() + INTERVAL '15 minutes'
         WHERE id = $2`,
        [codigo, empResult.rows[0].id]
      );
    }

    const payload = {
      mensagem: 'Codigo de verificacao gerado com sucesso. Valido por 15 minutos.',
    };

    if (process.env.NODE_ENV !== 'production') {
      payload.codigo_teste = codigo;
    }

    return res.json(payload);
  } catch (error) {
    return res.status(500).json({ erro: 'Erro ao solicitar redefinicao de senha.' });
  }
});

router.post('/resetar-senha', async (req, res) => {
  const { email, codigo, nova_senha } = req.body;

  if (!email || !codigo || !nova_senha) {
    return res.status(400).json({ erro: 'Preencha e-mail, codigo e nova senha.' });
  }

  if (nova_senha.length < 6) {
    return res.status(400).json({ erro: 'A nova senha deve ter pelo menos 6 caracteres.' });
  }

  const emailLimpo = email.trim().toLowerCase();

  try {
    const novaSenhaHash = await bcrypt.hash(nova_senha, 10);

    const funcResult = await pool.query(
      `UPDATE funcionarios
       SET senha_hash = $1,
           codigo_reset_senha = NULL,
           codigo_reset_expira = NULL
       WHERE LOWER(email) = $2
         AND codigo_reset_senha = $3
         AND codigo_reset_expira > NOW()
         AND ativo = TRUE
       RETURNING id`,
      [novaSenhaHash, emailLimpo, codigo.trim()]
    );

    if (funcResult.rowCount === 0) {
      const empResult = await pool.query(
        `UPDATE empresas
         SET senha_hash = $1,
             codigo_reset_senha = NULL,
             codigo_reset_expira = NULL
         WHERE LOWER(email) = $2
           AND codigo_reset_senha = $3
           AND codigo_reset_expira > NOW()
           AND ativo = TRUE
         RETURNING id`,
        [novaSenhaHash, emailLimpo, codigo.trim()]
      );

      if (empResult.rowCount === 0) {
        return res.status(400).json({ erro: 'Codigo invalido ou expirado.' });
      }
    }

    return res.json({ mensagem: 'Senha redefinida com sucesso. Voce ja pode acessar sua conta.' });
  } catch (error) {
    return res.status(500).json({ erro: 'Erro ao redefinir senha.' });
  }
});

module.exports = router;