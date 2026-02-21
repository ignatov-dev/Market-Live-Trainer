import { constants, createPublicKey, createVerify, verify as cryptoVerify } from 'node:crypto';

interface JwtHeader {
  alg?: string;
  kid?: string;
}

interface JwtPayload {
  sub?: string;
  iss?: string;
  aud?: string | string[];
  exp?: number;
  nbf?: number;
  iat?: number;
  [key: string]: unknown;
}

interface Jwk {
  kid?: string;
  kty?: string;
  n?: string;
  e?: string;
  alg?: string;
  use?: string;
}

interface VerifyTokenResult {
  userId: string;
  claims: JwtPayload;
}

interface AuthServiceOptions {
  jwksUrl: string;
  issuer: string | null;
  audience: string[];
  clockSkewSeconds: number;
  jwksCacheTtlMs: number;
}

export class AuthError extends Error {
  readonly statusCode: number;

  constructor(message: string, statusCode = 401) {
    super(message);
    this.name = 'AuthError';
    this.statusCode = statusCode;
  }
}

export class AuthService {
  private readonly jwksUrls: string[];
  private readonly issuer: string | null;
  private readonly audience: string[];
  private readonly clockSkewSeconds: number;
  private readonly jwksCacheTtlMs: number;
  private jwkCache: { keys: Jwk[]; expiresAt: number } | null = null;
  private pendingJwksFetch: Promise<Jwk[]> | null = null;

  constructor(options: AuthServiceOptions) {
    this.jwksUrls = buildJwksCandidates(options.jwksUrl);
    this.issuer = options.issuer;
    this.audience = options.audience;
    this.clockSkewSeconds = options.clockSkewSeconds;
    this.jwksCacheTtlMs = options.jwksCacheTtlMs;
  }

  extractBearerToken(authorizationHeader: string | string[] | undefined): string | null {
    if (typeof authorizationHeader !== 'string') {
      return null;
    }

    const match = authorizationHeader.match(/^Bearer\s+(.+)$/i);
    if (!match) {
      return null;
    }

    const token = match[1].trim();
    return token.length > 0 ? token : null;
  }

  async verifyAccessToken(token: string): Promise<VerifyTokenResult> {
    const parts = token.split('.');
    if (parts.length !== 3) {
      throw new AuthError('Invalid token format.');
    }

    const [encodedHeader, encodedPayload, encodedSignature] = parts;
    const header = this.parseHeader(encodedHeader);
    const payload = this.parsePayload(encodedPayload);

    const algorithm = header.alg ?? '';
    if (!SUPPORTED_ALGORITHMS.has(algorithm)) {
      throw new AuthError(`Unsupported token algorithm: ${algorithm || 'unknown'}.`);
    }

    if (!header.kid || header.kid.length === 0) {
      throw new AuthError('Token key id (kid) is missing.');
    }

    const jwk = await this.findSigningKey(header.kid);
    this.verifySignature(jwk, algorithm, `${encodedHeader}.${encodedPayload}`, encodedSignature);
    this.validateClaims(payload);

    if (typeof payload.sub !== 'string' || payload.sub.trim().length === 0) {
      throw new AuthError('Token subject is missing.');
    }

    return {
      userId: payload.sub,
      claims: payload,
    };
  }

  private parseHeader(encodedHeader: string): JwtHeader {
    try {
      const header = JSON.parse(Buffer.from(encodedHeader, 'base64url').toString('utf8')) as JwtHeader;
      if (!header || typeof header !== 'object') {
        throw new Error('Invalid JWT header.');
      }
      return header;
    } catch {
      throw new AuthError('Invalid token header.');
    }
  }

  private parsePayload(encodedPayload: string): JwtPayload {
    try {
      const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8')) as JwtPayload;
      if (!payload || typeof payload !== 'object') {
        throw new Error('Invalid JWT payload.');
      }
      return payload;
    } catch {
      throw new AuthError('Invalid token payload.');
    }
  }

  private async findSigningKey(kid: string): Promise<Jwk> {
    const keys = await this.getSigningKeys();
    const key = keys.find((item) => item.kid === kid);

    if (!key) {
      this.jwkCache = null;
      const refreshed = await this.getSigningKeys();
      const refreshedKey = refreshed.find((item) => item.kid === kid);
      if (!refreshedKey) {
        throw new AuthError('Token signing key not found.');
      }
      return refreshedKey;
    }

    return key;
  }

  private verifySignature(jwk: Jwk, algorithm: string, signingInput: string, encodedSignature: string): void {
    try {
      const signature = Buffer.from(encodedSignature, 'base64url');
      const publicKey = createPublicKey({
        key: jwk as any,
        format: 'jwk',
      });

      let isValid = false;

      if (algorithm === 'EdDSA') {
        isValid = cryptoVerify(null, Buffer.from(signingInput), publicKey, signature);
      } else {
        const verifyAlgorithm = RSA_ALGORITHM_MAP[algorithm];
        if (!verifyAlgorithm) {
          throw new AuthError(`Unsupported token algorithm: ${algorithm}.`);
        }

        const verifier = createVerify(verifyAlgorithm);
        verifier.update(signingInput);
        verifier.end();

        if (algorithm.startsWith('PS')) {
          isValid = verifier.verify(
            {
              key: publicKey,
              padding: constants.RSA_PKCS1_PSS_PADDING,
              saltLength: RSA_PSS_SALT_LENGTH_MAP[algorithm],
            },
            signature,
          );
        } else {
          isValid = verifier.verify(publicKey, signature);
        }
      }

      if (!isValid) {
        throw new AuthError('Invalid token signature.');
      }
    } catch (error) {
      if (error instanceof AuthError) {
        throw error;
      }
      throw new AuthError('Failed to verify token signature.');
    }
  }

  private validateClaims(payload: JwtPayload): void {
    const nowSeconds = Math.floor(Date.now() / 1000);
    const skew = this.clockSkewSeconds;

    if (typeof payload.exp === 'number' && nowSeconds > payload.exp + skew) {
      throw new AuthError('Token has expired.');
    }

    if (typeof payload.nbf === 'number' && nowSeconds + skew < payload.nbf) {
      throw new AuthError('Token is not active yet.');
    }

    if (this.issuer && payload.iss !== this.issuer) {
      throw new AuthError('Token issuer mismatch.');
    }

    if (this.audience.length > 0) {
      const tokenAudiences = this.normalizeAudience(payload.aud);
      const isAudienceMatched = this.audience.some((audience) => tokenAudiences.has(audience));
      if (!isAudienceMatched) {
        throw new AuthError('Token audience mismatch.');
      }
    }
  }

  private normalizeAudience(value: JwtPayload['aud']): Set<string> {
    if (typeof value === 'string') {
      return new Set([value]);
    }

    if (Array.isArray(value)) {
      return new Set(value.filter((item): item is string => typeof item === 'string'));
    }

    return new Set();
  }

  private async getSigningKeys(): Promise<Jwk[]> {
    const now = Date.now();
    if (this.jwkCache && now < this.jwkCache.expiresAt) {
      return this.jwkCache.keys;
    }

    if (this.pendingJwksFetch) {
      return this.pendingJwksFetch;
    }

    this.pendingJwksFetch = this.fetchSigningKeys()
      .then((keys) => {
        this.jwkCache = {
          keys,
          expiresAt: Date.now() + this.jwksCacheTtlMs,
        };
        return keys;
      })
      .finally(() => {
        this.pendingJwksFetch = null;
      });

    return this.pendingJwksFetch;
  }

  private async fetchSigningKeys(): Promise<Jwk[]> {
    let lastError: Error | null = null;

    for (const jwksUrl of this.jwksUrls) {
      try {
        const response = await fetch(jwksUrl, {
          method: 'GET',
          headers: {
            Accept: 'application/json',
          },
        });

        if (!response.ok) {
          lastError = new Error(`JWKS request failed for ${jwksUrl} (HTTP ${response.status}).`);
          continue;
        }

        const payload = (await response.json()) as { keys?: Jwk[] };
        if (!payload || !Array.isArray(payload.keys) || payload.keys.length === 0) {
          lastError = new Error(`JWKS payload does not include keys (${jwksUrl}).`);
          continue;
        }

        return payload.keys;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
      }
    }

    throw new AuthError(
      `Failed to load JWKS from configured URLs: ${this.jwksUrls.join(', ')}. ${lastError?.message ?? ''}`.trim(),
      503,
    );
  }
}

const SUPPORTED_ALGORITHMS = new Set(['RS256', 'RS384', 'RS512', 'PS256', 'PS384', 'PS512', 'EdDSA']);

const RSA_ALGORITHM_MAP: Record<string, string> = {
  RS256: 'RSA-SHA256',
  RS384: 'RSA-SHA384',
  RS512: 'RSA-SHA512',
  PS256: 'RSA-SHA256',
  PS384: 'RSA-SHA384',
  PS512: 'RSA-SHA512',
};

const RSA_PSS_SALT_LENGTH_MAP: Record<string, number> = {
  PS256: 32,
  PS384: 48,
  PS512: 64,
};

function buildJwksCandidates(jwksUrl: string): string[] {
  const normalized = jwksUrl.trim().replace(/\/$/, '');
  if (normalized.length === 0) {
    return [];
  }

  const candidates = [normalized];
  if (!normalized.endsWith('/.well-known/jwks.json')) {
    candidates.push(`${normalized}/.well-known/jwks.json`);
  }

  return [...new Set(candidates)];
}
