const jwt = require('jsonwebtoken');

function autenticar(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ erro: 'Token nao fornecido.' });
  }

  const [, token] = authHeader.split(' ');
  if (!token) {
    return res.status(401).json({ erro: 'Token mal formatado.' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.usuario = decoded;
    return next();
  } catch {
    return res.status(401).json({ erro: 'Token invalido ou expirado.' });
  }
}

function apenasEmpresaOuGestao(req, res, next) {
  const { tipo, perfil } = req.usuario;
  if (tipo === 'EMPRESA' || ['ADMIN', 'RH', 'GESTOR'].includes(perfil)) {
    return next();
  }
  return res.status(403).json({ erro: 'Acesso restrito a empresa ou gestao.' });
}

module.exports = { autenticar, apenasEmpresaOuGestao };