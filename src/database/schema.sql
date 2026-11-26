CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS empresas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    razao_social VARCHAR(255) NOT NULL,
    cnpj VARCHAR(18) NOT NULL UNIQUE,
    email VARCHAR(255) NOT NULL UNIQUE,
    senha_hash TEXT NOT NULL,
    politica_fora_raio VARCHAR(20) NOT NULL DEFAULT 'ALERTAR'
        CHECK (politica_fora_raio IN ('ALERTAR', 'BLOQUEAR', 'PERMITIR')),
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    codigo_reset_senha VARCHAR(6),
    codigo_reset_expira TIMESTAMPTZ,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS funcionarios (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    nome VARCHAR(255) NOT NULL,
    cpf VARCHAR(14) NOT NULL UNIQUE,
    pis VARCHAR(14),
    email VARCHAR(255) NOT NULL UNIQUE,
    senha_hash TEXT NOT NULL,
    cargo VARCHAR(120) DEFAULT 'Colaborador',
    perfil VARCHAR(20) NOT NULL DEFAULT 'COLABORADOR'
        CHECK (perfil IN ('COLABORADOR', 'ADMIN', 'RH')),
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    codigo_reset_senha VARCHAR(6),
    codigo_reset_expira TIMESTAMPTZ,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS locais_permitidos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    nome VARCHAR(150) NOT NULL,
    endereco TEXT,
    latitude NUMERIC(10, 7) NOT NULL,
    longitude NUMERIC(10, 7) NOT NULL,
    raio_metros INTEGER NOT NULL DEFAULT 150 CHECK (raio_metros > 0),
    precisao_maxima_metros INTEGER NOT NULL DEFAULT 100 CHECK (precisao_maxima_metros > 0),
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS funcionarios_locais (
    funcionario_id UUID NOT NULL REFERENCES funcionarios(id) ON DELETE CASCADE,
    local_id UUID NOT NULL REFERENCES locais_permitidos(id) ON DELETE CASCADE,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (funcionario_id, local_id)
);

CREATE TABLE IF NOT EXISTS registros_ponto (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    funcionario_id UUID NOT NULL REFERENCES funcionarios(id) ON DELETE CASCADE,
    local_id UUID REFERENCES locais_permitidos(id) ON DELETE SET NULL,
    nsr BIGSERIAL NOT NULL,
    tipo VARCHAR(30) NOT NULL
        CHECK (tipo IN ('ENTRADA', 'SAIDA_ALMOCO', 'RETORNO_ALMOCO', 'SAIDA', 'PONTO')),
    data_hora_servidor TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    data_hora_dispositivo TIMESTAMPTZ,
    latitude NUMERIC(10, 7),
    longitude NUMERIC(10, 7),
    precisao_metros INTEGER,
    distancia_metros INTEGER,
    fora_do_raio BOOLEAN NOT NULL DEFAULT FALSE,
    justificativa TEXT,
    hash_sha256 VARCHAR(64),
    hash_anterior VARCHAR(64),
    client_id VARCHAR(64),
    origem_offline BOOLEAN NOT NULL DEFAULT FALSE,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ajustes_ponto (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    funcionario_id UUID NOT NULL REFERENCES funcionarios(id) ON DELETE CASCADE,
    registro_original_id UUID REFERENCES registros_ponto(id) ON DELETE SET NULL,
    tipo VARCHAR(30) NOT NULL
        CHECK (tipo IN ('ENTRADA', 'SAIDA_ALMOCO', 'RETORNO_ALMOCO', 'SAIDA', 'INCLUSAO', 'DESCONSIDERACAO')),
    data_hora_solicitada TIMESTAMPTZ NOT NULL,
    motivo TEXT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDENTE'
        CHECK (status IN ('PENDENTE', 'APROVADO', 'REJEITADO')),
    avaliado_por UUID REFERENCES funcionarios(id) ON DELETE SET NULL,
    avaliado_em TIMESTAMPTZ,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_registros_ponto_client_id
    ON registros_ponto (empresa_id, client_id)
    WHERE client_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_empresas_email_lower
    ON empresas (LOWER(email));

CREATE INDEX IF NOT EXISTS idx_funcionarios_email_lower
    ON funcionarios (LOWER(email));

CREATE INDEX IF NOT EXISTS idx_funcionarios_empresa_ativo
    ON funcionarios (empresa_id, ativo);

CREATE INDEX IF NOT EXISTS idx_locais_empresa
    ON locais_permitidos (empresa_id);

CREATE INDEX IF NOT EXISTS idx_registros_ponto_empresa_nsr
    ON registros_ponto (empresa_id, nsr DESC);

CREATE INDEX IF NOT EXISTS idx_registros_ponto_func_data
    ON registros_ponto (funcionario_id, data_hora_servidor DESC);

CREATE INDEX IF NOT EXISTS idx_ajustes_ponto_empresa_status
    ON ajustes_ponto (empresa_id, status);